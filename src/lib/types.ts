export type Athlete = {
  id: string;
  name: string;
};

export type ActivityPhoto = {
  id: string;
  path: string;
  url: string;
  /** Set only for a locally-added photo whose upload hasn't resolved yet. */
  uploading?: boolean;
};

export type FeedEntry = {
  id: string;
  athleteId: string;
  loggedAt: string;
  activities: string[];
  durationLabel?: string;
  notes?: string;
  achievementNote?: string;
  kudosFromAthleteIds: string[];
  photos: ActivityPhoto[];
};

export type ActivityType = {
  id: string;
  label: string;
};

export type ActivityFormValues = {
  activities: string[];
  durationLabel?: string;
  notes?: string;
  /** Freshly-compressed photos to upload, in display order. */
  newPhotos: Blob[];
  /** ids (from `ActivityFormInitialValues.photos`) to keep — anything already
   * on the entry but missing from this list should be deleted. */
  keepPhotoIds: string[];
};

export type ActivityFormInitialValues = {
  activities: string[];
  durationLabel?: string;
  notes?: string;
  photos?: ActivityPhoto[];
};

export type CurrentUserSummary = {
  periodLabel: string;
  entriesThisPeriod: number;
  last30Days: number;
  rank: number;
  sparkline: number[];
  streakDays: number;
  weekStatus: boolean[];
  allTimeEntries: number;
  bestStreak: number;
  kudosReceived: number;
  todayLogged: boolean;
};

export type Comment = {
  id: string;
  athleteId: string;
  text: string;
  postedAt: string;
  /** emoji -> ids of the athletes who reacted with it */
  reactions: Record<string, string[]>;
};

export type Group = {
  id: string;
  name: string;
  inviteCode: string;
  role: "admin" | "member";
  memberCount: number;
};

export type ActivityBreakdownItem = {
  label: string;
  count: number;
  percent: number;
};

export type PeriodOption = {
  id: string;
  label: string;
};

export type PeriodProgress = {
  periodLabel: string;
  currentDay: number;
  totalDays: number;
};

export type LeaderboardRow = {
  athleteId: string;
  rank: number;
  workoutDays: number;
  recentCountLabel?: string;
  streakLabel?: string;
};

export type PeriodRankSummary = {
  periodId: string;
  rank: number | null;
  workoutDays: number;
};
