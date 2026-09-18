/* RunStatus — live SSE status for in-flight review runs. Subscribes to the
   run event streams and renders the shared LiveLogStream. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { LiveLogStream, type LogLine } from "@devdigest/ui";
import { useRunEvents } from "../../../../../../../lib/hooks/reviews";
import { LOG_HEIGHT } from "./constants";
import { s } from "./styles";

export function RunStatus({
  runIds,
  onDone,
}: {
  runIds: string[];
  onDone?: () => void;
}) {
  const t = useTranslations("prReview");
  const { events, running } = useRunEvents(runIds);
  const wasRunning = React.useRef(false);

  // `onDone` arrives as a fresh inline arrow on every parent render, so keeping
  // it in the dependency array re-ran this effect on every render — and because
  // the callback invalidates queries, each run triggered another render, which
  // recreated the callback, which re-ran the effect. A self-feeding refetch
  // storm for as long as `running` stayed false with runIds still live.
  // A ref gives the effect the latest callback without making it a dependency.
  const onDoneRef = React.useRef(onDone);
  onDoneRef.current = onDone;

  React.useEffect(() => {
    if (running) {
      wasRunning.current = true;
      return;
    }
    // Fire once per running→idle edge, then disarm: without resetting the latch
    // any later re-render would fire again.
    if (wasRunning.current) {
      wasRunning.current = false;
      onDoneRef.current?.();
    }
  }, [running]);

  if (runIds.length === 0) return null;

  const log: LogLine[] = events.map((e) => ({
    t: e.t,
    k: e.kind as LogLine["k"],
    m: e.msg,
  }));

  return (
    <div style={s.wrap}>
      <LiveLogStream
        log={log}
        running={running}
        height={LOG_HEIGHT}
        elapsedLabel={running ? t("runStatus.elapsed", { count: runIds.length }) : undefined}
      />
    </div>
  );
}
