import { defineStorage } from '@aws-amplify/backend';

export const storage = defineStorage({
  name: 'GakufuHubStorage',
  access: (allow) => ({
    'data/*': [
      allow.guest.to(['read', 'write']),
      allow.authenticated.to(['read', 'write', 'delete']),
    ]
  })
});