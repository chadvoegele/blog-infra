import { expect as expectCDK, countResources } from '@aws-cdk/assert'
import * as cdk from 'aws-cdk-lib'
import * as BlogInfra from '../lib/blog_infra-stack'

test('Stack', () => {
  const context = {
    domain: 'testdomain.com',
    subDomain: 'test'
  }
  const app = new cdk.App({ context })
  const stack = new BlogInfra.BlogInfraStack(app, 'MyTestStack')
  expectCDK(stack).to(countResources('AWS::IAM::Role', 2))
  expectCDK(stack).to(countResources('AWS::S3::Bucket', 1))
  expectCDK(stack).to(countResources('AWS::S3::BucketPolicy', 1))
  expectCDK(stack).to(countResources('AWS::CloudFront::CloudFrontOriginAccessIdentity', 1))
  expectCDK(stack).to(countResources('AWS::IAM::Policy', 1))
  expectCDK(stack).to(countResources('AWS::CloudFront::Distribution', 1))
  expectCDK(stack).to(countResources('AWS::Route53::RecordSet', 1))
})
