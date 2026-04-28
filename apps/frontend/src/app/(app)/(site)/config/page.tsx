export const dynamic = 'force-dynamic';
import { Metadata } from 'next';
import { Suspense } from 'react';

export const metadata: Metadata = {
  title: 'Config',
  description: 'View and edit autopilot configuration',
};

import { ConfigPage } from '@gitroom/frontend/components/config/config.component';

export default function Page() {
  return (
    <Suspense>
      <ConfigPage />
    </Suspense>
  );
}
