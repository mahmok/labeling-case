# Labeling Platform - AWS Deployment Options

## Option 1: ECS (Fargate) + RDS + S3/CloudFront

```mermaid
architecture-beta
    service user(internet)[Browser]
    service cf(cloud)[CloudFront CDN]
    service s3(disk)[S3 Frontend Bucket]
    service secrets(disk)[Secrets Manager]

    group vpc(cloud)[VPC]

    group public(cloud)[Public Subnets] in vpc
    service alb(internet)[Application Load Balancer] in public

    group private(cloud)[Private Subnets] in vpc
    group ecs(cloud)[ECS Cluster Fargate] in private
    service migrate(server)[Migrate Task One Off] in ecs
    service api(server)[API Service] in ecs
    service worker(server)[Worker Service] in ecs
    service rds(database)[RDS PostgreSQL] in private
    junction jmigrate in private
    junction jworker in private

    user:T --> B:cf
    cf:T --> B:s3
    user:R --> L:alb
    alb:R --> L:api
    api:R --> L:rds
    migrate:R -- L:jmigrate
    jmigrate:B --> T:rds
    worker:R -- L:jworker
    jworker:T --> B:rds
    migrate{group}:T --> B:secrets
```

## Option 2: Lambda + API Gateway + EventBridge + RDS

The API runs as a Lambda function behind API Gateway. The three scheduled jobs (`sync-printers`, `sync-labels`, `backfill-prints`) are triggered by EventBridge Scheduler, which invokes a jobs Lambda. There are no always-on containers. The frontend stays on S3 + CloudFront and the database is still RDS PostgreSQL.

```mermaid
architecture-beta
    service user(internet)[Browser]
    service cf(cloud)[CloudFront CDN]
    service s3(disk)[S3 Frontend Bucket]
    service apigw(internet)[API Gateway HTTP API]
    service secrets(disk)[Secrets Manager]
    service scheduler(cloud)[EventBridge Scheduler]

    group vpc(cloud)[VPC]
    group private(cloud)[Private Subnets] in vpc
    service apifn(server)[API Lambda] in private
    service jobsfn(server)[Jobs Lambda] in private
    service proxy(database)[RDS Proxy] in private
    service rds(database)[RDS PostgreSQL] in private
    junction jjobs in private

    user:T --> B:cf
    cf:T --> B:s3
    user:R --> L:apigw
    apigw:R --> L:apifn
    apifn:R --> L:proxy
    proxy:R --> L:rds
    jobsfn:R -- L:jjobs
    jjobs:T --> B:proxy
    scheduler:T --> B:jobsfn
    apifn:T --> B:secrets
```
