import type { NextConfig } from "next";

const s3Region = process.env.NEXT_PUBLIC_S3_REGION ?? "us-east-1";
const userUploadBucket =
  process.env.NEXT_PUBLIC_S3_USER_UPLOAD_BUCKET ??
  "replace-me-user-uploads-bucket";
const recommendationBucket =
  process.env.NEXT_PUBLIC_S3_RECOMMENDATION_BUCKET ??
  "replace-me-recommendation-renders-bucket";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname:
          process.env.NEXT_PUBLIC_S3_USER_UPLOAD_HOSTNAME ??
          `${userUploadBucket}.s3.${s3Region}.amazonaws.com`,
      },
      {
        protocol: "https",
        hostname:
          process.env.NEXT_PUBLIC_S3_RECOMMENDATION_HOSTNAME ??
          `${recommendationBucket}.s3.${s3Region}.amazonaws.com`,
      },
    ],
  },
};

export default nextConfig;
