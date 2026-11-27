import type { BetterAuthOptions } from 'better-auth';
import { APIError } from 'better-auth/api';
import type { createAuth } from '../../index';
import { sessionLifetime } from '../../constants';
import type { AuthAdapter, ServerAuthOptions, VerifiedAccount } from '../../types';
import { assertLiveAccount } from '../../utils';
import type { GitHubAccess } from './types';

const githubProvider = 'github';

export const getGitHubAccess = async (
  server: ReturnType<typeof createAuth>,
  account: VerifiedAccount,
): Promise<GitHubAccess> => {
  await assertLiveAccount(server, account);
  const { internalAdapter, adapter } = await server.$context;
  const accounts = await internalAdapter.findAccounts(account.id);
  const github = accounts.find(({ providerId }) => providerId === githubProvider);
  const deadline = Date.now() - sessionLifetime * 1000;
  const available = github && github.updatedAt.getTime() > deadline;
  if (!available) throw new APIError('UNAUTHORIZED', { message: 'Sign in with GitHub again.' });
  const credentials = await server.api.getAccessToken({
    body: { accountId: github.id, userId: account.id },
  });
  if (!credentials.scopes.includes('gist')) {
    throw new APIError('FORBIDDEN', { message: 'The GitHub account must grant Gist permissions.' });
  }
  await adapter.update({
    model: 'account',
    where: [{ field: 'id', value: github.id }],
    update: { updatedAt: new Date() },
  });
  return { token: credentials.accessToken, githubId: github.accountId };
};

export const clearExpiredGitHubTokens = async (adapter: AuthAdapter) => {
  const deadline = new Date(Date.now() - sessionLifetime * 1000);
  await adapter.updateMany({
    model: 'account',
    where: [
      { field: 'providerId', value: githubProvider },
      { field: 'updatedAt', value: deadline, operator: 'lt' },
    ],
    update: {
      accessToken: null,
      refreshToken: null,
      idToken: null,
      accessTokenExpiresAt: null,
      refreshTokenExpiresAt: null,
    },
  });
};

export function githubProviderOptions(
  options: ServerAuthOptions,
): BetterAuthOptions['socialProviders'] {
  return {
    github: {
      clientId: options.githubClientId,
      clientSecret: options.githubClientSecret,
      disableDefaultScope: true,
      scope: ['gist'],
      mapProfileToUser: (profile) => ({
        name: 'GitHub account',
        email: `github-${profile.id}@m2rd.invalid`,
        emailVerified: false,
        image: undefined,
      }),
    },
  };
}
