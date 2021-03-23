import * as acm from '@aws-cdk/aws-certificatemanager'
import * as cdk from '@aws-cdk/core'
import * as cloudfront from '@aws-cdk/aws-cloudfront'
import * as iam from '@aws-cdk/aws-iam'
import * as route53 from '@aws-cdk/aws-route53'
import * as s3 from '@aws-cdk/aws-s3'
import * as targets from '@aws-cdk/aws-route53-targets'

export class BlogInfraStack extends cdk.Stack {
  constructor (scope: cdk.Construct, id: string, props?: cdk.StackProps) {
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
    const accountId = cdk.Stack.of(this).account

    const outputZoneIdName = `${domain.replace('.', '')}ZoneId`
    const zone = route53.HostedZone.fromHostedZoneAttributes(this, 'Zone', {
      hostedZoneId: cdk.Fn.importValue(outputZoneIdName),
      zoneName: domain
    })

    const publisherRole = new iam.Role(this, 'SitePublisherRole', {
      assumedBy: new iam.ArnPrincipal(cdk.Fn.importValue('UserArn')),
      description: 'This role can be used to publish site content.',
      roleName: `${siteDomain}Publisher`
    })

    const siteBucket = new s3.Bucket(this, 'SiteBucket', {
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
        principals: [new iam.ArnPrincipal(`arn:aws:iam::${accountId}:role/admin`)]
      })
    )

    // https://github.com/aws/aws-cdk/pull/4491
    const oai = new cloudfront.OriginAccessIdentity(this, 'OAI')
    siteBucket.grantRead(oai)

    const certificate = new acm.DnsValidatedCertificate(this, 'SiteCertificate', {
      domainName: siteDomain,
      hostedZone: zone,
      region: 'us-east-1'
    })

    const errorCodes = [400, 403, 404, 405, 414, 416, 500, 501, 502, 503, 504]
    const distribution = new cloudfront.CloudFrontWebDistribution(this, 'SiteDistribution', {
      aliasConfiguration: {
        acmCertRef: certificate.certificateArn,
        names: [siteDomain],
        sslMethod: cloudfront.SSLMethod.SNI,
        securityPolicy: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2019
      },
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

    new route53.ARecord(this, 'SiteAliasRecord', { // eslint-disable-line no-new
      recordName: siteDomain,
      target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution)),
      zone
    })
  }
}
