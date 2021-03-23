#!/usr/bin/env node
import 'source-map-support/register'
import * as cdk from '@aws-cdk/core'
import { BlogInfraStack } from '../lib/blog_infra-stack'

const app = new cdk.App()
const env = { region: 'us-east-1' }
new BlogInfraStack(app, 'BlogInfraStack', { env }) // eslint-disable-line no-new
