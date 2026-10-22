import { DEFAULT_LANGUAGE, type Language } from '@travelsteps/shared';

export interface PushMessages {
  someone: string;
  yourStep: string;
  postTitle: (actor: string, travel: string | null) => string;
  postBody: string;
  inviteTitle: (actor: string) => string;
  inviteBody: (travel: string | null) => string;
  likeTitle: (actor: string) => string;
  likeBody: (actor: string, title: string) => string;
  commentTitle: (actor: string, title: string) => string;
  commentBody: string;
}

const nl: PushMessages = {
  someone: 'Iemand',
  yourStep: 'je stap',
  postTitle: (actor, travel) =>
    travel ? `${actor} plaatste een nieuwe stap in ${travel}` : `${actor} plaatste een nieuwe stap`,
  postBody: 'Bekijk de nieuwe stap.',
  inviteTitle: (actor) => `${actor} nodigt je uit om mee te reizen`,
  inviteBody: (travel) =>
    travel
      ? `Schrijf mee aan "${travel}". Open je meldingen om de uitnodiging te accepteren.`
      : 'Open je meldingen om de uitnodiging te accepteren.',
  likeTitle: (actor) => `${actor} vindt je stap leuk`,
  likeBody: (actor, title) => `${actor} gaf een like op ${title}.`,
  commentTitle: (actor, title) => `${actor} reageerde op ${title}`,
  commentBody: 'Bekijk de reactie bij je stap.',
};

const en: PushMessages = {
  someone: 'Someone',
  yourStep: 'your step',
  postTitle: (actor, travel) =>
    travel ? `${actor} posted a new step in ${travel}` : `${actor} posted a new step`,
  postBody: 'Have a look at the new step.',
  inviteTitle: (actor) => `${actor} invites you to travel along`,
  inviteBody: (travel) =>
    travel
      ? `Write along in "${travel}". Open your notifications to accept the invitation.`
      : 'Open your notifications to accept the invitation.',
  likeTitle: (actor) => `${actor} likes your step`,
  likeBody: (actor, title) => `${actor} liked ${title}.`,
  commentTitle: (actor, title) => `${actor} commented on ${title}`,
  commentBody: 'See the comment on your step.',
};

const MESSAGES: Record<Language, PushMessages> = { nl, en };

/** Push texts in the recipient's language (not chosen yet → Dutch). */
export const pushMessages = (language: Language | null | undefined): PushMessages =>
  MESSAGES[language ?? DEFAULT_LANGUAGE];
