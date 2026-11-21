'use client';

import { useMachine } from '@xstate/react';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { AUTH_FORM } from '@/app/state/utils';

export default function Consent() {
  const [state, send] = useMachine(AUTH_FORM);
  const submitting = state.matches('submitting');
  const { error } = state.context;
  return (
    <main className="mx-auto grid min-h-screen max-w-md content-center px-4">
      <Card>
        <CardHeader>
          <CardTitle>Allow access to m2rd?</CardTitle>
          <p className="text-sm text-muted-foreground">
            The requesting client can render Mermaid and save diagrams to unlisted Gists in your
            GitHub account.
          </p>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button disabled={submitting} onClick={() => send({ type: 'submit', action: 'allow' })}>
            Allow
          </Button>
          <Button
            disabled={submitting}
            variant="outline"
            onClick={() => send({ type: 'submit', action: 'deny' })}
          >
            Deny
          </Button>
          {error && <p role="alert">{error}</p>}
        </CardContent>
      </Card>
    </main>
  );
}
