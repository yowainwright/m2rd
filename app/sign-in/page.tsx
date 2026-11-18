'use client';

import { useMachine } from '@xstate/react';
import type { MouseEvent } from 'react';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { AUTH_FORM, getSignInCancelPath } from '@/app/state/utils';

export default function SignIn() {
  const [state, send] = useMachine(AUTH_FORM);
  const submitting = state.matches('submitting');
  const { error } = state.context;
  return (
    <main className="mx-auto grid min-h-screen max-w-md content-center px-4">
      <Card>
        <CardHeader>
          <CardTitle>Sign in to m2rd</CardTitle>
          <p className="text-sm text-muted-foreground">
            Use GitHub to save diagrams as unlisted Gists.
          </p>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Button disabled={submitting} onClick={() => send({ type: 'submit', action: 'sign-in' })}>
            Continue with GitHub
          </Button>
          <Button asChild variant="ghost">
            <a href="/m2rd/" onClick={cancelSignIn}>
              Back to the editor
            </a>
          </Button>
          {error && <p role="alert">{error}</p>}
        </CardContent>
      </Card>
    </main>
  );
}

const cancelSignIn = (event: MouseEvent<HTMLAnchorElement>) => {
  event.preventDefault();
  window.location.assign(getSignInCancelPath());
};
