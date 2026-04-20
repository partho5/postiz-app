export const dynamic = 'force-dynamic';
import { Metadata } from 'next';
import { AutopilotChatLayout } from '@gitroom/frontend/components/autopilot/chat-layout';

export const metadata: Metadata = {
  title: 'Autopilot',
  description: 'AI social media autopilot',
};

export default function AutopilotPage() {
  return <AutopilotChatLayout />;
}
