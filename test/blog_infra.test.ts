import { Template } from 'aws-cdk-lib/assertions'
import * as cdk from 'aws-cdk-lib'
import * as BlogInfra from '../lib/blog_infra-stack'

test('Stack', () => {
  const context = {
    domain: 'testdomain.com',
    subDomain: 'test'
  }
  const app = new cdk.App({ context })
  const stack = new BlogInfra.BlogInfraStack(app, 'MyTestStack')
  const template = Template.fromStack(stack)

  template.resourceCountIs('AWS::IAM::Role', 2)
  template.resourceCountIs('AWS::S3::Bucket', 1)
  template.resourceCountIs('AWS::S3::BucketPolicy', 1)
  template.resourceCountIs('AWS::CloudFront::CloudFrontOriginAccessIdentity', 1)
  template.resourceCountIs('AWS::IAM::Policy', 1)
  template.resourceCountIs('AWS::CloudFront::Distribution', 1)
  template.resourceCountIs('AWS::Route53::RecordSet', 1)
})
