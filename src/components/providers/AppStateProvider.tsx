"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { refreshAppData } from "@/app/actions";
import { Celebration, type CelebrationData } from "@/components/celebration/Celebration";
import { ActivityModal } from "@/components/activity/ActivityModal";
import { DayDetailsSheet } from "@/components/profile/DayDetailsSheet";
import { Toast } from "@/components/ui/Toast";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { parseDateKey, toDateKey } from "@/lib/date";
import { playKudosSound } from "@/lib/sound";
import { ACTIVITY_PHOTOS_BUCKET, SIGNED_URL_TTL_SECONDS } from "@/lib/photo";
import {
  buildTrailingWindow,
  buildWeekStatus,
  computeBestStreak,
  computeCurrentStreak,
  computeKudosReceived,
  countLoggedDaysInWindow,
  getLoggedDateKeys,
  isDayLogged,
} from "@/lib/stats";
import type {
  ActivityFormValues,
  ActivityPhoto,
  ActivityType,
  Athlete,
  Comment,
  CurrentUserSummary,
  FeedEntry,
} from "@/lib/types";

type BrowserSupabaseClient = ReturnType<typeof createBrowserSupabaseClient>;

/** Uploads one already-compressed photo and returns its persisted record. Throws on any failure — the caller decides how to reflect that in UI state. */
async function persistActivityPhoto(
  supabase: BrowserSupabaseClient,
  activityId: string,
  athleteId: string,
  blob: Blob,
  position: number
): Promise<ActivityPhoto> {
  const id = crypto.randomUUID();
  const path = `${athleteId}/${activityId}/${id}.jpg`;

  const { error: uploadError } = await supabase.storage
    .from(ACTIVITY_PHOTOS_BUCKET)
    .upload(path, blob, { contentType: "image/jpeg" });
  if (uploadError) throw uploadError;

  const { error: insertError } = await supabase
    .from("activity_photos")
    .insert({ id, activity_id: activityId, athlete_id: athleteId, storage_path: path, position });
  if (insertError) {
    await supabase.storage.from(ACTIVITY_PHOTOS_BUCKET).remove([path]);
    throw insertError;
  }

  const { data: signedData } = await supabase.storage
    .from(ACTIVITY_PHOTOS_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

  return { id, path, url: signedData?.signedUrl ?? "" };
}

type ActivityModalState =
  | { mode: "add"; dateKey: string }
  | { mode: "edit"; entryId: string }
  | null;

type AppState = {
  summary: CurrentUserSummary;
  entries: FeedEntry[];
  athletes: Athlete[];
  currentUser: Athlete;
  commentsByEntryId: Record<string, Comment[]>;
  activityTypes: ActivityType[];
  toastMessage: string | null;
  activityModal: ActivityModalState;
  dayDetailsDateKey: string | null;

  toggleKudos: (entryId: string) => void;
  toggleReaction: (entryId: string, commentId: string, emoji: string) => void;
  addComment: (entryId: string, text: string) => void;
  addCustomActivityType: (label: string) => Promise<string>;
  saveActivity: (values: ActivityFormValues) => void;
  deleteActivity: (entryId: string) => void;
  showToast: (message: string) => void;

  openAddActivity: (dateKey: string) => void;
  openEditActivity: (entryId: string) => void;
  closeActivityModal: () => void;
  openDayDetails: (dateKey: string) => void;
  closeDayDetails: () => void;
};

const AppStateContext = createContext<AppState | null>(null);

type AppStateProviderProps = {
  initialSummary: CurrentUserSummary;
  initialEntries: FeedEntry[];
  athletes: Athlete[];
  currentUser: Athlete;
  initialComments: Record<string, Comment[]>;
  periodDaysElapsed: number;
  initialActivityTypes: ActivityType[];
  groupId: string;
  groupName: string;
  children: ReactNode;
};

export function AppStateProvider({
  initialSummary,
  initialEntries,
  athletes,
  currentUser,
  initialComments,
  periodDaysElapsed,
  initialActivityTypes,
  groupId,
  groupName,
  children,
}: AppStateProviderProps) {
  const router = useRouter();
  const [entries, setEntries] = useState(initialEntries);
  const [commentsByEntryId, setCommentsByEntryId] = useState(initialComments);
  const [activityTypes, setActivityTypes] = useState<ActivityType[]>(initialActivityTypes);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [activityModal, setActivityModal] = useState<ActivityModalState>(null);
  const [dayDetailsDateKey, setDayDetailsDateKey] = useState<string | null>(null);
  const [celebration, setCelebration] = useState<CelebrationData | null>(null);
  // Rows written by this client that the server may not have committed yet.
  // A realtime refetch must not make them vanish mid-flight.
  const pendingEntryIds = useRef(new Set<string>());
  const pendingCommentIds = useRef(new Set<string>());

  useEffect(() => {
    if (!toastMessage) return;
    const timeout = setTimeout(() => setToastMessage(null), 2500);
    return () => clearTimeout(timeout);
  }, [toastMessage]);

  const showToast = useCallback((message: string) => {
    setToastMessage(message);
  }, []);

  const summary = useMemo<CurrentUserSummary>(() => {
    const today = new Date();
    const loggedDateKeys = getLoggedDateKeys(entries, currentUser.id);
    const streakDays = computeCurrentStreak(loggedDateKeys, today);
    const bestStreak = Math.max(computeBestStreak(loggedDateKeys), streakDays);

    return {
      periodLabel: initialSummary.periodLabel,
      rank: initialSummary.rank,
      entriesThisPeriod: countLoggedDaysInWindow(loggedDateKeys, today, periodDaysElapsed),
      last30Days: countLoggedDaysInWindow(loggedDateKeys, today, 30),
      sparkline: buildTrailingWindow(loggedDateKeys, today, 30),
      streakDays,
      weekStatus: buildWeekStatus(loggedDateKeys, today),
      allTimeEntries: loggedDateKeys.size,
      bestStreak,
      kudosReceived: computeKudosReceived(entries, currentUser.id),
      todayLogged: isDayLogged(loggedDateKeys, today),
    };
  }, [entries, currentUser.id, initialSummary.periodLabel, initialSummary.rank, periodDaysElapsed]);

  const toggleKudos = useCallback(
    (entryId: string) => {
      const entry = entries.find((e) => e.id === entryId);
      if (!entry) return;
      const hasGiven = entry.kudosFromAthleteIds.includes(currentUser.id);
      if (!hasGiven) playKudosSound();

      setEntries((prev) =>
        prev.map((e) =>
          e.id !== entryId
            ? e
            : {
                ...e,
                kudosFromAthleteIds: hasGiven
                  ? e.kudosFromAthleteIds.filter((id) => id !== currentUser.id)
                  : [...e.kudosFromAthleteIds, currentUser.id],
              }
        )
      );

      const revert = () => {
        setEntries((prev) =>
          prev.map((e) =>
            e.id !== entryId
              ? e
              : {
                  ...e,
                  kudosFromAthleteIds: hasGiven
                    ? [...e.kudosFromAthleteIds, currentUser.id]
                    : e.kudosFromAthleteIds.filter((id) => id !== currentUser.id),
                }
          )
        );
        showToast("Couldn't update kudos — try again");
      };

      const supabase = createBrowserSupabaseClient();
      const write = hasGiven
        ? supabase.from("kudos").delete().eq("activity_id", entryId).eq("athlete_id", currentUser.id)
        : supabase.from("kudos").insert({ activity_id: entryId, athlete_id: currentUser.id });

      write.then(({ error }) => {
        if (error) revert();
      });
    },
    [entries, currentUser.id, showToast]
  );

  const addComment = useCallback(
    (entryId: string, text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      const id = crypto.randomUUID();
      const newComment: Comment = {
        id,
        athleteId: currentUser.id,
        text: trimmed,
        postedAt: new Date().toISOString(),
        reactions: {},
      };
      pendingCommentIds.current.add(id);

      setCommentsByEntryId((prev) => {
        const existing = prev[entryId] ?? [];
        return { ...prev, [entryId]: [...existing, newComment] };
      });

      const supabase = createBrowserSupabaseClient();
      supabase
        .from("comments")
        .insert({ id, activity_id: entryId, athlete_id: currentUser.id, text: trimmed })
        .then(({ error }) => {
          pendingCommentIds.current.delete(id);
          if (!error) return;
          setCommentsByEntryId((prev) => {
            const existing = prev[entryId] ?? [];
            return { ...prev, [entryId]: existing.filter((comment) => comment.id !== id) };
          });
          showToast("Couldn't post comment — try again");
        });
    },
    [currentUser.id, showToast]
  );

  const toggleReaction = useCallback(
    (entryId: string, commentId: string, emoji: string) => {
      const mutate = (add: boolean) =>
        setCommentsByEntryId((prev) => ({
          ...prev,
          [entryId]: (prev[entryId] ?? []).map((comment) => {
            if (comment.id !== commentId) return comment;
            const current = comment.reactions[emoji] ?? [];
            const next = add
              ? current.includes(currentUser.id)
                ? current
                : [...current, currentUser.id]
              : current.filter((id) => id !== currentUser.id);
            const reactions = { ...comment.reactions };
            if (next.length > 0) reactions[emoji] = next;
            else delete reactions[emoji];
            return { ...comment, reactions };
          }),
        }));

      const hasReacted = (commentsByEntryId[entryId] ?? [])
        .find((comment) => comment.id === commentId)
        ?.reactions[emoji]?.includes(currentUser.id);

      mutate(!hasReacted);

      const supabase = createBrowserSupabaseClient();
      const write = hasReacted
        ? supabase
            .from("comment_reactions")
            .delete()
            .eq("comment_id", commentId)
            .eq("athlete_id", currentUser.id)
            .eq("emoji", emoji)
        : supabase
            .from("comment_reactions")
            .insert({ comment_id: commentId, athlete_id: currentUser.id, emoji });

      write.then(({ error }) => {
        if (!error) return;
        mutate(Boolean(hasReacted));
        showToast("Couldn't save that reaction — try again");
      });
    },
    [commentsByEntryId, currentUser.id, showToast]
  );

  const addCustomActivityType = useCallback(
    async (label: string): Promise<string> => {
      const trimmed = label.trim();
      if (!trimmed) return "";

      const existing = activityTypes.find(
        (type) => type.label.toLowerCase() === trimmed.toLowerCase()
      );
      if (existing) return existing.label;

      const id = crypto.randomUUID();
      setActivityTypes((prev) => [...prev, { id, label: trimmed }]);

      const supabase = createBrowserSupabaseClient();
      const { error } = await supabase
        .from("activity_types")
        .insert({ id, label: trimmed, created_by: currentUser.id });

      if (error) {
        setActivityTypes((prev) => prev.filter((type) => type.id !== id));
        showToast("Couldn't add that activity type — try again");
        return "";
      }

      return trimmed;
    },
    [activityTypes, currentUser.id, showToast]
  );

  // Uploads each newly-picked photo independently: an optimistic local
  // preview appears immediately (via its own blob URL), then gets swapped
  // for the real signed URL once the upload + row insert resolve, or
  // dropped with a toast if either fails. A failed photo never reverts the
  // activity itself — the two are intentionally decoupled.
  const uploadNewPhotos = useCallback(
    (entryId: string, athleteId: string, blobs: Blob[], startPosition: number) => {
      if (blobs.length === 0) return;
      const supabase = createBrowserSupabaseClient();

      blobs.forEach((blob, index) => {
        const tempId = crypto.randomUUID();
        const previewUrl = URL.createObjectURL(blob);

        setEntries((prev) =>
          prev.map((entry) =>
            entry.id === entryId
              ? { ...entry, photos: [...entry.photos, { id: tempId, path: "", url: previewUrl, uploading: true }] }
              : entry
          )
        );

        persistActivityPhoto(supabase, entryId, athleteId, blob, startPosition + index)
          .then((photo) => {
            setEntries((prev) =>
              prev.map((entry) =>
                entry.id === entryId
                  ? { ...entry, photos: entry.photos.map((p) => (p.id === tempId ? photo : p)) }
                  : entry
              )
            );
            URL.revokeObjectURL(previewUrl);
          })
          .catch(() => {
            setEntries((prev) =>
              prev.map((entry) =>
                entry.id === entryId
                  ? { ...entry, photos: entry.photos.filter((p) => p.id !== tempId) }
                  : entry
              )
            );
            URL.revokeObjectURL(previewUrl);
            showToast("Couldn't upload a photo — try again");
          });
      });
    },
    [showToast]
  );

  // Removed photos are already dropped from UI state by the caller
  // (optimistic); this only handles the actual storage + row deletion,
  // restoring them on failure.
  const persistPhotoRemoval = useCallback(
    (entryId: string, removed: ActivityPhoto[]) => {
      if (removed.length === 0) return;
      const supabase = createBrowserSupabaseClient();

      Promise.all(
        removed.map(async (photo) => {
          await supabase.storage.from(ACTIVITY_PHOTOS_BUCKET).remove([photo.path]);
          const { error } = await supabase.from("activity_photos").delete().eq("id", photo.id);
          if (error) throw error;
        })
      ).catch(() => {
        setEntries((prev) =>
          prev.map((entry) =>
            entry.id === entryId ? { ...entry, photos: [...entry.photos, ...removed] } : entry
          )
        );
        showToast("Couldn't remove a photo — try again");
      });
    },
    [showToast]
  );

  const saveActivity = useCallback(
    (values: ActivityFormValues) => {
      if (!activityModal) return;

      const supabase = createBrowserSupabaseClient();
      const typeIdByLabel = new Map(activityTypes.map((type) => [type.label, type.id]));
      const typeIds = values.activities
        .map((label) => typeIdByLabel.get(label))
        .filter((id): id is string => Boolean(id));

      if (activityModal.mode === "edit") {
        const { entryId } = activityModal;
        const previousEntries = entries;
        const existingPhotos = entries.find((entry) => entry.id === entryId)?.photos ?? [];
        const removedPhotos = existingPhotos.filter(
          (photo) => !values.keepPhotoIds.includes(photo.id)
        );

        setEntries((prev) =>
          prev.map((entry) =>
            entry.id === entryId
              ? {
                  ...entry,
                  activities: values.activities,
                  durationLabel: values.durationLabel,
                  notes: values.notes,
                  photos: entry.photos.filter((photo) => values.keepPhotoIds.includes(photo.id)),
                }
              : entry
          )
        );
        showToast("Activity updated");
        setActivityModal(null);

        (async () => {
          const { error: updateError } = await supabase
            .from("activities")
            .update({
              duration_label: values.durationLabel ?? null,
              notes: values.notes ?? null,
            })
            .eq("id", entryId);
          if (updateError) throw updateError;

          const { error: deleteTypesError } = await supabase
            .from("activity_entry_types")
            .delete()
            .eq("activity_id", entryId);
          if (deleteTypesError) throw deleteTypesError;

          if (typeIds.length > 0) {
            const { error: insertTypesError } = await supabase
              .from("activity_entry_types")
              .insert(typeIds.map((activity_type_id) => ({ activity_id: entryId, activity_type_id })));
            if (insertTypesError) throw insertTypesError;
          }
        })()
          .then(() => {
            persistPhotoRemoval(entryId, removedPhotos);
            uploadNewPhotos(entryId, currentUser.id, values.newPhotos, values.keepPhotoIds.length);
          })
          .catch(() => {
            setEntries(previousEntries);
            showToast("Couldn't save that update — try again");
          });
      } else {
        const { dateKey } = activityModal;
        const now = new Date();
        const isToday = toDateKey(now) === dateKey;
        const entryDate = isToday ? now : parseDateKey(dateKey);
        if (!isToday) entryDate.setHours(12, 0, 0, 0);

        const id = crypto.randomUUID();
        const newEntry: FeedEntry = {
          id,
          athleteId: currentUser.id,
          loggedAt: entryDate.toISOString(),
          activities: values.activities,
          durationLabel: values.durationLabel,
          notes: values.notes,
          kudosFromAthleteIds: [],
          photos: [],
        };

        const previousEntries = entries;
        pendingEntryIds.current.add(id);
        setEntries((prev) => [newEntry, ...prev]);
        setActivityModal(null);

        if (isToday) {
          const keys = getLoggedDateKeys([newEntry, ...entries], currentUser.id);
          setCelebration({
            name: currentUser.name,
            groupName,
            activities: values.activities,
            durationLabel: values.durationLabel,
            streakDays: computeCurrentStreak(keys, now),
            daysThisPeriod: countLoggedDaysInWindow(keys, now, periodDaysElapsed),
            periodLabel: initialSummary.periodLabel,
          });
        } else {
          showToast("Activity logged");
        }

        (async () => {
          const { error: insertError } = await supabase.from("activities").insert({
            id,
            athlete_id: currentUser.id,
            logged_at: newEntry.loggedAt,
            duration_label: values.durationLabel ?? null,
            notes: values.notes ?? null,
          });
          if (insertError) throw insertError;

          if (typeIds.length > 0) {
            const { error: typesError } = await supabase
              .from("activity_entry_types")
              .insert(typeIds.map((activity_type_id) => ({ activity_id: id, activity_type_id })));
            if (typesError) throw typesError;
          }
        })()
          .then(() => {
            pendingEntryIds.current.delete(id);
            uploadNewPhotos(id, currentUser.id, values.newPhotos, 0);
          })
          .catch(() => {
            pendingEntryIds.current.delete(id);
            setCelebration(null);
            setEntries(previousEntries);
            showToast("Couldn't save that activity — try again");
          });
      }
    },
    [
      activityModal,
      activityTypes,
      currentUser.id,
      currentUser.name,
      entries,
      groupName,
      initialSummary.periodLabel,
      periodDaysElapsed,
      persistPhotoRemoval,
      showToast,
      uploadNewPhotos,
    ]
  );

  const deleteActivity = useCallback(
    (entryId: string) => {
      const previousEntries = entries;
      const previousComments = commentsByEntryId;
      const photoPaths = (entries.find((entry) => entry.id === entryId)?.photos ?? [])
        .map((photo) => photo.path)
        .filter(Boolean);

      setEntries((prev) => prev.filter((entry) => entry.id !== entryId));
      setCommentsByEntryId((prev) => {
        const next = { ...prev };
        delete next[entryId];
        return next;
      });
      setActivityModal(null);
      showToast("Activity deleted");

      const supabase = createBrowserSupabaseClient();
      supabase
        .from("activities")
        .delete()
        .eq("id", entryId)
        .then(({ error }) => {
          if (error) {
            setEntries(previousEntries);
            setCommentsByEntryId(previousComments);
            showToast("Couldn't delete — try again");
            return;
          }
          // Best-effort: activity_photos rows cascade with the activity,
          // but the storage objects themselves don't — clean them up so
          // they don't linger in the bucket. Not worth reverting over.
          if (photoPaths.length > 0) {
            void supabase.storage.from(ACTIVITY_PHOTOS_BUCKET).remove(photoPaths);
          }
        });
    },
    [entries, commentsByEntryId, showToast]
  );

  // Live updates: when a groupmate logs, reacts or comments, refetch the
  // feed. Own writes are skipped (already applied optimistically), bursts
  // are debounced into one refetch, and returning to the app refetches too
  // since a backgrounded PWA's socket may have been suspended.
  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastRefresh = 0;
    let cancelled = false;

    const refresh = async () => {
      lastRefresh = Date.now();
      try {
        const fresh = await refreshAppData();
        if (cancelled) return;

        setEntries((prev) => {
          const prevById = new Map(prev.map((entry) => [entry.id, entry]));
          const freshIds = new Set(fresh.entries.map((entry) => entry.id));
          const merged = fresh.entries.map((entry) => {
            const uploading = (prevById.get(entry.id)?.photos ?? []).filter((p) => p.uploading);
            return uploading.length > 0
              ? { ...entry, photos: [...entry.photos, ...uploading] }
              : entry;
          });
          const pending = prev.filter(
            (entry) => pendingEntryIds.current.has(entry.id) && !freshIds.has(entry.id)
          );
          return [...pending, ...merged];
        });

        setCommentsByEntryId((prev) => {
          const next = { ...fresh.comments };
          // Keep comments this client posted that the server hasn't confirmed yet.
          for (const [entryId, list] of Object.entries(prev)) {
            for (const comment of list) {
              if (!pendingCommentIds.current.has(comment.id)) continue;
              if ((next[entryId] ?? []).some((c) => c.id === comment.id)) continue;
              next[entryId] = [...(next[entryId] ?? []), comment];
            }
          }
          return next;
        });
        // Re-render server components (board, masthead counts, rank).
        router.refresh();
      } catch {
        // Offline or transient — the next event or focus will retry.
      }
    };

    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(refresh, 600);
    };

    const onChange = (payload: { new: Record<string, unknown> }) => {
      // Skip echoes of this user's own inserts/updates.
      const author = payload.new?.athlete_id;
      if (author && author === currentUser.id) return;
      schedule();
    };

    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - lastRefresh > 5000) schedule();
    };
    document.addEventListener("visibilitychange", onVisible);

    let channel: ReturnType<typeof supabase.channel> | undefined;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session) supabase.realtime.setAuth(data.session.access_token);
      channel = supabase.channel(`sweaties-${groupId}`);
      for (const table of ["activities", "kudos", "comments", "comment_reactions"]) {
        channel.on("postgres_changes", { event: "*", schema: "public", table }, onChange);
      }
      channel.subscribe();
    });

    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [currentUser.id, groupId, router]);

  const openAddActivity = useCallback((dateKey: string) => {
    setActivityModal({ mode: "add", dateKey });
  }, []);

  const openEditActivity = useCallback((entryId: string) => {
    setActivityModal({ mode: "edit", entryId });
  }, []);

  const closeActivityModal = useCallback(() => setActivityModal(null), []);
  const openDayDetails = useCallback((dateKey: string) => setDayDetailsDateKey(dateKey), []);
  const closeDayDetails = useCallback(() => setDayDetailsDateKey(null), []);

  const value: AppState = {
    summary,
    entries,
    athletes,
    currentUser,
    commentsByEntryId,
    activityTypes,
    toastMessage,
    activityModal,
    dayDetailsDateKey,
    toggleKudos,
    toggleReaction,
    addComment,
    addCustomActivityType,
    saveActivity,
    deleteActivity,
    showToast,
    openAddActivity,
    openEditActivity,
    closeActivityModal,
    openDayDetails,
    closeDayDetails,
  };

  return (
    <AppStateContext.Provider value={value}>
      {children}
      <DayDetailsSheet />
      <ActivityModal />
      <Toast message={toastMessage} />
      <Celebration data={celebration} onClose={() => setCelebration(null)} />
    </AppStateContext.Provider>
  );
}

export function useAppState(): AppState {
  const context = useContext(AppStateContext);
  if (!context) {
    throw new Error("useAppState must be used within an AppStateProvider");
  }
  return context;
}
