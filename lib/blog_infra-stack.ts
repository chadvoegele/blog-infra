import * as acm from 'aws-cdk-lib/aws-certificatemanager'
import * as cdk from 'aws-cdk-lib'
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as route53 from 'aws-cdk-lib/aws-route53'
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as targets from 'aws-cdk-lib/aws-route53-targets'

export class BlogInfraStack extends cdk.Stack {
  accountId: string

  constructor (scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props)

    const domain = scope.node.tryGetContext('domain')
    if (domain === undefined) {
      throw new Error('Could not get domain from context!')
    }
    const subDomain = scope.node.tryGetContext('subDomain')
    if (subDomain === undefined) {
      throw new Error('Could not get subDomain from context!')
    }
    const siteDomain = `${subDomain}.${domain}`
    this.accountId = cdk.Stack.of(this).account

    const outputZoneIdName = `${domain.replace('.', '')}ZoneId`
    const zone = route53.HostedZone.fromHostedZoneAttributes(this, 'Zone', {
      hostedZoneId: cdk.Fn.importValue(outputZoneIdName),
      zoneName: domain
    })

    this.makeWebsite(zone, siteDomain)
  }

  makeWebsite (zone: route53.IHostedZone, siteDomain: string) {
    const publisherRole = new iam.Role(this, `SitePublisherRole-${siteDomain}`, {
      assumedBy: new iam.ArnPrincipal(cdk.Fn.importValue('UserArn')),
      description: 'This role can be used to publish site content.',
      roleName: `${siteDomain}Publisher`
    })

    const siteBucket = new s3.Bucket(this, `SiteBucket-${siteDomain}`, {
      bucketName: siteDomain,
      websiteIndexDocument: 'index.html',
      websiteErrorDocument: 'error.html',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      encryption: s3.BucketEncryption.S3_MANAGED
    })
    siteBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        resources: [
          siteBucket.arnForObjects('*'),
          siteBucket.bucketArn
        ],
        actions: ['s3:List*', 's3:Get*', 's3:Put*'],
        principals: [publisherRole]
      })
    )
    siteBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        resources: [
          siteBucket.arnForObjects('*'),
          siteBucket.bucketArn
        ],
        actions: ['*'],
        principals: [new iam.ArnPrincipal(`arn:aws:iam::${this.accountId}:role/admin`)]
      })
    )

    // https://github.com/aws/aws-cdk/pull/4491
    const oai = new cloudfront.OriginAccessIdentity(this, `OAI-${siteDomain}`)
    siteBucket.grantRead(oai)

    const certificate = new acm.DnsValidatedCertificate(this, `SiteCertificate-${siteDomain}`, {
      domainName: siteDomain,
      hostedZone: zone,
      region: 'us-east-1'
    })

    const errorCodes = [400, 403, 404, 405, 414, 416, 500, 501, 502, 503, 504]
    const distribution = new cloudfront.CloudFrontWebDistribution(this, `SiteDistribution-${siteDomain}`, {
      viewerCertificate: cloudfront.ViewerCertificate.fromAcmCertificate(certificate, {
        aliases: [siteDomain],
        securityPolicy: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
        sslMethod: cloudfront.SSLMethod.SNI
      }),
      originConfigs: [{
        s3OriginSource: {
          s3BucketSource: siteBucket,
          originAccessIdentity: oai
        },
        behaviors: [{ isDefaultBehavior: true }]
      }],
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      errorConfigurations: errorCodes.map(e => ({
        errorCode: e,
        responseCode: 404,
        responsePagePath: '/error.html'
      }))
    })

    new route53.ARecord(this, `SiteAliasRecord-${siteDomain}`, { // eslint-disable-line no-new
      recordName: siteDomain,
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution)),
      zone
    })
  }
}
