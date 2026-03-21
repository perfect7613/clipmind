"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";

interface Clip {
  id: string;
  title: string;
  duration_s: number;
  mood: string;
  scores: Record<string, number>;
  render_url: string;
}

interface FeedbackPin {
  id?: string;
  timestamp_s: number;
  comment: string;
}

export default function ResultsPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const [job, setJob] = useState<any>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClip, setSelectedClip] = useState<Clip | null>(null);
  const [feedbackPins, setFeedbackPins] = useState<FeedbackPin[]>([]);
  const [newComment, setNewComment] = useState("");
  const [pinTimestamp, setPinTimestamp] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchJob();
  }, [jobId]);

  const fetchJob = async () => {
    try {
      const res = await fetch(`/api/jobs/${jobId}`);
      const data = await res.json();
      setJob(data);
      setClips(data.clips || []);
      if (data.clips?.length > 0) setSelectedClip(data.clips[0]);
    } catch { /* ignore */ }
    setLoading(false);
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!videoRef.current || !progressRef.current) return;
    const rect = progressRef.current.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    const timestamp = pct * (videoRef.current.duration || 0);
    setPinTimestamp(Math.round(timestamp * 10) / 10);
    videoRef.current.currentTime = timestamp;
  };

  const submitFeedback = async () => {
    if (pinTimestamp === null || !newComment || !selectedClip) return;
    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clipId: selectedClip.id,
          timestampS: pinTimestamp,
          comment: newComment,
        }),
      });
      setFeedbackPins([...feedbackPins, { timestamp_s: pinTimestamp, comment: newComment }]);
      setNewComment("");
      setPinTimestamp(null);
    } catch { /* ignore */ }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <p className="text-muted-foreground">Loading results...</p>
      </div>
    );
  }

  if (job?.status === "processing") {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Card className="w-96">
          <CardContent className="pt-6 space-y-4">
            <Progress value={job.progressPct || 0} />
            <p className="text-sm text-center text-muted-foreground capitalize">
              {job.currentStep?.replace(/_/g, " ") || "Processing..."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <h1 className="text-3xl font-bold">Results</h1>

        {/* Video Player */}
        {selectedClip && (
          <Card>
            <CardContent className="pt-6 space-y-4">
              <video
                ref={videoRef}
                src={selectedClip.render_url}
                controls
                className="w-full rounded-lg"
              />

              {/* Clickable progress bar with feedback pins */}
              <div
                ref={progressRef}
                className="relative h-8 bg-muted rounded cursor-pointer"
                onClick={handleProgressClick}
              >
                {/* Feedback pin markers */}
                {feedbackPins.map((pin, i) => {
                  const pct = videoRef.current?.duration
                    ? (pin.timestamp_s / videoRef.current.duration) * 100
                    : 0;
                  return (
                    <div
                      key={i}
                      className="absolute top-0 w-2 h-full bg-yellow-500 rounded"
                      style={{ left: `${pct}%` }}
                      title={`${pin.timestamp_s}s: ${pin.comment}`}
                    />
                  );
                })}
                <p className="text-xs text-center leading-8 text-muted-foreground">
                  Click to add feedback at a specific moment
                </p>
              </div>

              {/* Comment input */}
              {pinTimestamp !== null && (
                <div className="flex gap-2 items-center">
                  <Badge variant="outline">{pinTimestamp}s</Badge>
                  <Input
                    placeholder="What's wrong at this moment?"
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && submitFeedback()}
                    className="flex-1"
                  />
                  <Button onClick={submitFeedback} size="sm">
                    Pin
                  </Button>
                  <Button onClick={() => setPinTimestamp(null)} variant="ghost" size="sm">
                    Cancel
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Clip Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {clips.map((clip) => (
            <Card
              key={clip.id}
              className={`cursor-pointer transition-all ${
                selectedClip?.id === clip.id ? "ring-2 ring-primary" : ""
              }`}
              onClick={() => setSelectedClip(clip)}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">{clip.title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex gap-2">
                  <Badge>{clip.mood}</Badge>
                  <Badge variant="outline">{Math.round(clip.duration_s)}s</Badge>
                </div>
                <div className="flex gap-1 text-xs text-muted-foreground">
                  {Object.entries(clip.scores || {}).map(([k, v]) => (
                    <span key={k}>{k}: {String(v)}</span>
                  ))}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (clip.render_url) {
                      const a = document.createElement("a");
                      a.href = clip.render_url;
                      a.download = `${clip.title}.mp4`;
                      a.click();
                    }
                  }}
                >
                  Download
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
