"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { TimelineEditor } from "@/components/timeline";

interface Clip {
  id: string;
  title: string;
  durationS: number;
  mood: string;
  scores: Record<string, number>;
  renderUrl: string;
}

const TRANSITIONS = [
  { id: "fade", label: "Fade" },
  { id: "fadeblack", label: "Dip to Black" },
  { id: "fadewhite", label: "Dip to White" },
  { id: "dissolve", label: "Dissolve" },
  { id: "wipeleft", label: "Wipe Left" },
  { id: "wiperight", label: "Wipe Right" },
  { id: "slideleft", label: "Slide Left" },
  { id: "slideright", label: "Slide Right" },
  { id: "circleopen", label: "Circle Open" },
  { id: "circleclose", label: "Circle Close" },
  { id: "zoomin", label: "Zoom In" },
  { id: "pixelize", label: "Pixelize" },
  { id: "radial", label: "Radial" },
  { id: "diagbr", label: "Diagonal" },
  { id: "smoothleft", label: "Smooth Left" },
  { id: "smoothright", label: "Smooth Right" },
];

export default function ResultsPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const router = useRouter();
  const [job, setJob] = useState<any>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedClipId, setExpandedClipId] = useState<string | null>(null);

  // Highlight reel state
  const [clipOrder, setClipOrder] = useState<{ clipId: string; transitionToNext: string }[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [isStitching, setIsStitching] = useState(false);
  const [stitchProgress, setStitchProgress] = useState(0);

  // Feedback
  const [feedbackClipId, setFeedbackClipId] = useState<string | null>(null);
  const [newComment, setNewComment] = useState("");
  const [pinTimestamp, setPinTimestamp] = useState<number | null>(null);

  const fetchJob = useCallback(async () => {
    try {
      const res = await fetch(`/api/jobs/${jobId}`);
      if (!res.ok) { setError("Failed to load job"); setLoading(false); return; }
      const data = await res.json();
      setJob(data);
      setClips(data.clips || []);
      // Initialize clip order
      if (data.clips?.length > 0 && clipOrder.length === 0) {
        setClipOrder(data.clips.map((c: Clip) => ({
          clipId: c.id,
          transitionToNext: "fade",
        })));
      }
    } catch { setError("Failed to load job"); }
    setLoading(false);
  }, [jobId, clipOrder.length]);

  useEffect(() => { fetchJob(); }, [fetchJob]);

  useEffect(() => {
    if (!job || job.status !== "processing") return;
    const interval = setInterval(fetchJob, 3000);
    return () => clearInterval(interval);
  }, [job, fetchJob]);

  const getVideoUrl = (clip: Clip) => `/api/clips/${clip.id}/video`;
  const getClipById = (id: string) => clips.find((c) => c.id === id);

  // Drag and drop reordering
  const handleDragStart = (index: number) => setDragIndex(index);
  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) return;
    const newOrder = [...clipOrder];
    const [moved] = newOrder.splice(dragIndex, 1);
    newOrder.splice(index, 0, moved);
    setClipOrder(newOrder);
    setDragIndex(index);
  };
  const handleDragEnd = () => setDragIndex(null);

  // Update transition for a specific clip
  const updateTransition = (index: number, transition: string) => {
    const newOrder = [...clipOrder];
    newOrder[index] = { ...newOrder[index], transitionToNext: transition };
    setClipOrder(newOrder);
  };

  // Re-stitch highlight reel with current order + transitions
  const handleRestitch = async () => {
    setIsStitching(true);
    setStitchProgress(0);
    try {
      const response = await fetch(`/api/jobs/${jobId}/stitch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clipOrder, defaultTransition: "fade", transitionDuration: 0.7 }),
      });
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const text = decoder.decode(value);
          const lines = text.split("\n").filter((l) => l.startsWith("data: "));
          for (const line of lines) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.pct) setStitchProgress(data.pct);
              if (data.step === "completed") { setIsStitching(false); fetchJob(); }
              if (data.step === "failed") { setIsStitching(false); }
            } catch {}
          }
        }
      }
    } catch { setIsStitching(false); }
  };

  const submitFeedback = async () => {
    if (pinTimestamp === null || !newComment || !feedbackClipId) return;
    await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clipId: feedbackClipId, timestampS: pinTimestamp, comment: newComment }),
    }).catch(() => {});
    setNewComment("");
    setPinTimestamp(null);
  };

  // Loading / Error / Processing states
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="w-96"><CardContent className="pt-6 text-center space-y-4">
          <p className="text-destructive">{error}</p>
          <Button onClick={() => router.push("/dashboard")}>Back</Button>
        </CardContent></Card>
      </div>
    );
  }
  if (job?.status === "failed") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="w-[500px]"><CardHeader><CardTitle className="text-destructive">Failed</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{job.errorMessage}</p>
          <Button onClick={() => router.push("/dashboard")}>Back</Button>
        </CardContent></Card>
      </div>
    );
  }
  if (job?.status === "processing" || job?.status === "pending") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="w-[400px]"><CardHeader><CardTitle>Processing</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Progress value={job.progressPct || 0} />
          <p className="text-sm text-center text-muted-foreground capitalize">
            {job.currentStep?.replace(/_/g, " ") || "Starting..."}
          </p>
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Your Clips</h1>
            <p className="text-sm text-muted-foreground">
              {clips.length} clip{clips.length !== 1 ? "s" : ""} generated
              {job?.presetId && <span> &middot; {job.presetId}</span>}
            </p>
          </div>
          <Button variant="outline" onClick={() => router.push("/dashboard")}>Back</Button>
        </div>

        {/* ═══ Highlight Reel Builder ═══ */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Highlight Reel</CardTitle>
              <div className="flex gap-2">
                {job?.highlightReelUrl && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(`/api/jobs/${jobId}/highlight-reel`, "_blank")}
                  >
                    Download Reel
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={handleRestitch}
                  disabled={isStitching || clipOrder.length < 2}
                >
                  {isStitching ? "Stitching..." : "Build Highlight Reel"}
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Drag clips to reorder. Select transition effect between each clip.
            </p>
          </CardHeader>
          <CardContent className="space-y-1">
            {isStitching && <Progress value={stitchProgress} className="mb-3" />}

            {clipOrder.map((item, index) => {
              const clip = getClipById(item.clipId);
              if (!clip) return null;
              const isLast = index === clipOrder.length - 1;

              return (
                <div key={item.clipId}>
                  {/* Draggable clip row */}
                  <div
                    draggable
                    onDragStart={() => handleDragStart(index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDragEnd={handleDragEnd}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-grab active:cursor-grabbing transition-colors ${
                      dragIndex === index ? "border-primary bg-primary/5" : "border-border hover:bg-muted/30"
                    }`}
                  >
                    {/* Drag handle */}
                    <div className="text-muted-foreground select-none">
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                        <circle cx="5" cy="4" r="1.5" /><circle cx="11" cy="4" r="1.5" />
                        <circle cx="5" cy="8" r="1.5" /><circle cx="11" cy="8" r="1.5" />
                        <circle cx="5" cy="12" r="1.5" /><circle cx="11" cy="12" r="1.5" />
                      </svg>
                    </div>

                    {/* Clip number */}
                    <div className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
                      {index + 1}
                    </div>

                    {/* Clip info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{clip.title}</p>
                      <div className="flex gap-1.5 mt-0.5">
                        <Badge variant="secondary" className="text-[10px] h-4">{clip.mood}</Badge>
                        <Badge variant="outline" className="text-[10px] h-4">{Math.round(clip.durationS)}s</Badge>
                      </div>
                    </div>
                  </div>

                  {/* Transition selector between clips */}
                  {!isLast && (
                    <div className="flex items-center gap-2 py-2 px-4">
                      <div className="flex-1 h-px bg-border" />
                      <select
                        value={item.transitionToNext}
                        onChange={(e) => updateTransition(index, e.target.value)}
                        className="text-xs bg-muted border border-border rounded px-2 py-1 text-foreground"
                      >
                        {TRANSITIONS.map((t) => (
                          <option key={t.id} value={t.id}>{t.label}</option>
                        ))}
                      </select>
                      <div className="flex-1 h-px bg-border" />
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* ═══ Individual Clip Editors ═══ */}
        <div className="space-y-4">
          {clips.map((clip) => {
            const isExpanded = expandedClipId === clip.id;
            return (
              <Card key={clip.id} className="overflow-hidden">
                <div
                  className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => setExpandedClipId(isExpanded ? null : clip.id)}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-1 h-10 rounded-full ${isExpanded ? "bg-primary" : "bg-muted"}`} />
                    <div>
                      <h3 className="font-medium">{clip.title}</h3>
                      <div className="flex gap-2 mt-1">
                        <Badge variant="secondary" className="text-xs">{clip.mood}</Badge>
                        <Badge variant="outline" className="text-xs">{Math.round(clip.durationS)}s</Badge>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {clip.scores && Object.entries(clip.scores).slice(0, 3).map(([k, v]) => (
                      <span key={k} className="text-xs text-muted-foreground">
                        <span className="capitalize">{k}</span> <span className="font-mono text-foreground">{String(v)}</span>
                      </span>
                    ))}
                    <Separator orientation="vertical" className="h-6 mx-2" />
                    <Button variant="ghost" size="sm" onClick={(e) => {
                      e.stopPropagation();
                      window.open(getVideoUrl(clip), "_blank");
                    }}>Download</Button>
                    <Button variant={isExpanded ? "default" : "outline"} size="sm"
                      onClick={(e) => { e.stopPropagation(); setExpandedClipId(isExpanded ? null : clip.id); }}>
                      {isExpanded ? "Close" : "Edit"}
                    </Button>
                  </div>
                </div>

                {isExpanded && (
                  <CardContent className="border-t bg-muted/10 p-4 space-y-4">
                    <TimelineEditor clipId={clip.id} videoSrc={getVideoUrl(clip)} />
                    <Separator />
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">Leave feedback to improve future edits</p>
                      <div className="flex gap-2 items-center">
                        <Input type="number" step={0.1} min={0} max={clip.durationS}
                          placeholder="Time (s)" className="w-24"
                          value={pinTimestamp ?? ""}
                          onChange={(e) => { setPinTimestamp(e.target.value ? parseFloat(e.target.value) : null); setFeedbackClipId(clip.id); }}
                        />
                        <Input placeholder="What would you change?"
                          value={feedbackClipId === clip.id ? newComment : ""}
                          onChange={(e) => { setNewComment(e.target.value); setFeedbackClipId(clip.id); }}
                          onKeyDown={(e) => e.key === "Enter" && submitFeedback()}
                          className="flex-1"
                        />
                        <Button onClick={submitFeedback} size="sm" disabled={!newComment || pinTimestamp === null}>Pin</Button>
                      </div>
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>

        {clips.length === 0 && job?.status === "completed" && (
          <Card><CardContent className="pt-6 text-center">
            <p className="text-muted-foreground">No clips generated. Try a different video.</p>
          </CardContent></Card>
        )}
      </div>
    </div>
  );
}
