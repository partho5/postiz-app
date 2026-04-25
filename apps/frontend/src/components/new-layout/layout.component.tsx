 'use client';

import React, { FC, ReactNode, useCallback, useState } from 'react';
import { Logo } from '@gitroom/frontend/components/new-layout/logo';
import { Plus_Jakarta_Sans } from 'next/font/google';
const ModeComponent = dynamic(
  () => import('@gitroom/frontend/components/layout/mode.component'),
  {
    ssr: false,
  }
);

import clsx from 'clsx';
import dynamic from 'next/dynamic';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import { useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { CheckPayment } from '@gitroom/frontend/components/layout/check.payment';
import { ToolTip } from '@gitroom/frontend/components/layout/top.tip';
import { ShowMediaBoxModal } from '@gitroom/frontend/components/media/media.component';
import { ShowLinkedinCompany } from '@gitroom/frontend/components/launches/helpers/linkedin.component';
import { MediaSettingsLayout } from '@gitroom/frontend/components/launches/helpers/media.settings.component';
import { Toaster } from '@gitroom/react/toaster/toaster';
import { ShowPostSelector } from '@gitroom/frontend/components/post-url-selector/post.url.selector';
import { NewSubscription } from '@gitroom/frontend/components/layout/new.subscription';
import { Support } from '@gitroom/frontend/components/layout/support';
import { ContinueProvider } from '@gitroom/frontend/components/layout/continue.provider';
import { ContextWrapper } from '@gitroom/frontend/components/layout/user.context';
import { CopilotKit } from '@copilotkit/react-core';
import { MantineWrapper } from '@gitroom/react/helpers/mantine.wrapper';
import { Impersonate } from '@gitroom/frontend/components/layout/impersonate';
import { Title } from '@gitroom/frontend/components/layout/title';
import { TopMenu } from '@gitroom/frontend/components/layout/top.menu';
import { LanguageComponent } from '@gitroom/frontend/components/layout/language.component';
import { ChromeExtensionComponent } from '@gitroom/frontend/components/layout/chrome.extension.component';
import NotificationComponent from '@gitroom/frontend/components/notifications/notification.component';
import { BillingAfter } from '@gitroom/frontend/components/new-layout/billing.after';
import { OrganizationSelector } from '@gitroom/frontend/components/layout/organization.selector';
import { PreConditionComponent } from '@gitroom/frontend/components/layout/pre-condition.component';
 import { AttachToFeedbackIcon } from '@gitroom/frontend/components/new-layout/sentry.feedback.component';

const jakartaSans = Plus_Jakarta_Sans({
  weight: ['600', '500'],
  style: ['normal', 'italic'],
  subsets: ['latin'],
});

export const LayoutComponent = ({ children }: { children: ReactNode }) => {
  const fetch = useFetch();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const { backendUrl, billingEnabled, isGeneral } = useVariables();

  // Feedback icon component attaches Sentry feedback to a top-bar icon when DSN is present
  const searchParams = useSearchParams();
  const load = useCallback(async (path: string) => {
    return await (await fetch(path)).json();
  }, []);
  const { data: user, mutate } = useSWR('/user/self', load, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    revalidateIfStale: false,
    refreshWhenOffline: false,
    refreshWhenHidden: false,
  });

  if (!user) return null;

  return (
    <ContextWrapper user={user}>
      <CopilotKit
        credentials="include"
        runtimeUrl={backendUrl + '/copilot/chat'}
        showDevConsole={false}
      >
        <MantineWrapper>
          {user.tier === 'FREE' && searchParams.get('check') && (
            <CheckPayment check={searchParams.get('check')!} mutate={mutate} />
          )}
          <ToolTip />
          <ShowMediaBoxModal />
          <ShowLinkedinCompany />
          <MediaSettingsLayout />
          <Toaster />
          <ShowPostSelector />
          <PreConditionComponent />
          <NewSubscription />
          <Support />
          <ContinueProvider />
          <div
            className={clsx(
              'flex flex-col min-h-screen min-w-screen text-newTextColor p-0 md:p-[12px]',
              jakartaSans.className
            )}
          >
            <div>{user?.admin ? <Impersonate /> : <div />}</div>
            {user.tier === 'FREE' && isGeneral && billingEnabled ? (
              <BillingAfter />
            ) : (
              <div className="flex-1 flex gap-0 md:gap-[8px]">
                {/* Desktop sidebar — hidden on mobile */}
                <div className="hidden md:flex flex-col bg-newBgColorInner w-[80px] rounded-[12px]">
                  <div className={clsx("fixed h-full w-[64px] start-[17px] flex flex-1 top-0", user?.admin && 'pt-[60px]')}>
                    <div className="flex flex-col h-full gap-[32px] flex-1 py-[12px]">
                      <Logo />
                      <TopMenu />
                    </div>
                  </div>
                </div>

                {/* Mobile sidebar drawer — always rendered, animated */}
                <div className={clsx("fixed inset-0 z-50 md:hidden", sidebarOpen ? "pointer-events-auto" : "pointer-events-none")}>
                  {/* Backdrop */}
                  <div
                    className={clsx("absolute inset-0 bg-black/60 transition-opacity duration-300", sidebarOpen ? "opacity-100" : "opacity-0")}
                    onClick={() => setSidebarOpen(false)}
                  />
                  {/* Drawer panel */}
                  <div
                    className={clsx(
                      "absolute left-0 top-0 h-full w-[80px] bg-newBgColorInner flex flex-col py-[12px] gap-[32px] rounded-r-[12px] transition-transform duration-300",
                      user?.admin && 'pt-[60px]',
                      sidebarOpen ? "translate-x-0" : "-translate-x-full"
                    )}
                  >
                    {/* Close button */}
                    <button
                      className="absolute top-[10px] right-[8px] text-textItemBlur hover:text-newTextColor transition-colors"
                      onClick={() => setSidebarOpen(false)}
                      aria-label="Close menu"
                    >
                      <CloseIcon />
                    </button>
                    <Logo />
                    <TopMenu />
                  </div>
                </div>

                <div className="flex-1 bg-newBgLineColor md:rounded-[12px] overflow-hidden flex flex-col gap-[1px] blurMe">
                  <div className="flex bg-newBgColorInner h-[80px] px-[20px] items-center">
                    {/* Hamburger — mobile only */}
                    <button
                      className="md:hidden mr-[12px] text-textItemBlur hover:text-newTextColor transition-colors"
                      onClick={() => setSidebarOpen((v) => !v)}
                      aria-label="Open menu"
                    >
                      <HamburgerIcon />
                    </button>
                    <div className="text-[24px] font-[600] flex flex-1">
                      <Title />
                    </div>
                    <div className="flex gap-[20px] text-textItemBlur">
                      <OrganizationSelector />
                      <div className="hover:text-newTextColor">
                        <ModeComponent />
                      </div>
                      <div className="w-[1px] h-[20px] bg-blockSeparator" />
                      <LanguageComponent />
                      <ChromeExtensionComponent />
                      <div className="w-[1px] h-[20px] bg-blockSeparator" />
                      <AttachToFeedbackIcon />
                      <NotificationComponent />
                    </div>
                  </div>
                  <div className="flex flex-1 gap-[1px]">{children}</div>
                </div>
              </div>
            )}
          </div>
        </MantineWrapper>
      </CopilotKit>
    </ContextWrapper>
  );
};

const HamburgerIcon: FC = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="3" y1="6" x2="21" y2="6" />
    <line x1="3" y1="12" x2="21" y2="12" />
    <line x1="3" y1="18" x2="21" y2="18" />
  </svg>
);

const CloseIcon: FC = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);
