# Autopilot

## What can the autopilot do?

The autopilot is an AI-powered social media manager you talk to in plain language. It can schedule posts, manage your queue, pull analytics, research topics, analyze competitors, and remember things about your business across sessions. You do not need to use any UI — just describe what you want and it handles it.

## Schedule a post

Say what you want to post, which platform, and when. Natural language timing works — "tomorrow at 9am", "in 3 hours", "next Monday", "after 30 minutes". The autopilot generates the content for you and shows a draft preview before queuing it. You do not need to write the full post yourself.

## What time formats are supported for scheduling?

Any natural language expression works — "tomorrow at 9am", "next Monday", "in 3 hours", "after 30 minutes", "this Friday at noon". ISO 8601 timestamps also work. The autopilot uses your account timezone, not UTC.

## Schedule to multiple platforms at once

Say "post this on LinkedIn and Twitter" and the autopilot schedules the content (adapted per platform) across both in one go.

## List your upcoming posts

Say "what's scheduled?", "show my queue", or "list upcoming posts". The autopilot returns all pending scheduled posts with their times and platforms.

## Cancel a scheduled post

Name the post you want removed — by topic, platform, or approximate time — and the autopilot finds and cancels it. Only posts that haven't gone live yet can be cancelled.

## Reschedule a post

Move a scheduled post to a different time without cancelling and recreating it. Say "move my LinkedIn post to Friday" and it handles it.

## Pause automated posting

Suspends all automated posts from going out — useful during a company event or sensitive news cycle. Posts stay in the queue, nothing is deleted. Say "pause posting".

## Resume automated posting

Re-enables the posting schedule after a pause. Say "resume posting".

## Rollback a published post

Deletes a post that already went live. Say "rollback my last post" or name the specific one. Subject to platform API support.

## Get analytics for a platform

Ask for engagement stats on any connected platform — impressions, likes, comments, shares. Say "show me my Twitter analytics" or "how is LinkedIn performing this week?". Data is pulled live from the platform at the time you ask.

## Which platforms support analytics?

Any platform you have connected in Postiz — Twitter/X, LinkedIn, Instagram, Facebook, and others. If a platform is not connected, the autopilot will tell you.

## Research a topic

Ask the autopilot to research any topic before creating content — "research AI trends in healthcare" or "what's happening with electric vehicles". It searches the web and returns a summary you can use to inform your posts.

## Analyze a competitor account

Ask the autopilot to analyze a competitor's public social presence — "check what @competitor is posting on Twitter". It returns a summary of their content strategy, cadence, and themes.

## View your business profile

The autopilot stores your niche, goals, brand voice, and content rules. Ask "show my business profile" to see what it has.

## Update your business profile

Say "update my niche to B2B SaaS" or "change my brand voice to formal". The autopilot updates the relevant field in your profile and uses it when generating future content.

## Opt out of strategy suggestions

Say "stop giving me strategy suggestions" or "disable strategy mode". The autopilot will stop automatically suggesting content strategy based on your profile.

## Save something to memory

Tell the autopilot to remember anything — brand rules, posting preferences, business context. Say "remember that we never post on Sundays" or "save that our brand voice is casual and direct". Memories persist across all future sessions.

## Recall saved memories

Say "what do you remember about our brand?" or "recall my posting rules". The autopilot searches its memory and returns relevant notes. Memory is also used automatically when it's relevant to a request.

## Does memory persist across conversations?

Yes. Memory is stored in the database and persists indefinitely. It is scoped to your organization — all users in the same Postiz org share the same memory store.

## What is the difference between the business profile and memory?

The business profile is structured — niche, goals, brand voice, anti-patterns, regulatory flags. Memory is free-form notes you explicitly save. Both are used by the autopilot when generating content and answering questions.
