import { defineFunction } from "@aws-amplify/backend";
import { storage } from "../../storage/resource";

export const diffFunction = defineFunction({
  environment: {
    BUCKET_NAME: storage.resources.bucketName,
  },
  permissions: [storage.permissions.readWrite()],
});
