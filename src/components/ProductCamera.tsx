import { useEffect, useRef, useState } from "react";
import { Camera, RotateCcw, Check, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function ProductCamera({ onPhoto, onClose }: { onPhoto: (file: File) => Promise<void>; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let disposed = false;
    if (!navigator.mediaDevices?.getUserMedia) { setError("Camera is unavailable. Choose a photo instead."); return; }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false }).then((value) => {
      if (disposed) { value.getTracks().forEach((track) => track.stop()); return; }
      stream.current = value;
      if (video.current) { video.current.srcObject = value; void video.current.play().catch(() => setError("Could not start the camera")); }
    }).catch(() => setError("Camera access was denied or no camera was found. Choose a photo instead."));
    return () => { disposed = true; stream.current?.getTracks().forEach((track) => track.stop()); stream.current = null; };
  }, []);
  useEffect(() => {
    if (!photo) { setPreview(""); return; }
    const url = URL.createObjectURL(photo); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);
  function snap() {
    const source = video.current;
    if (!source?.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = source.videoWidth; canvas.height = source.videoHeight;
    canvas.getContext("2d")?.drawImage(source, 0, 0);
    canvas.toBlob((blob) => { if (blob) setPhoto(blob); }, "image/jpeg", 0.9);
  }
  return <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
    <DialogContent className="max-w-xl">
      <DialogHeader><DialogTitle>Product photo</DialogTitle></DialogHeader>
      <div className="relative aspect-[4/3] overflow-hidden rounded-md bg-muted">
        <video ref={video} autoPlay muted playsInline onLoadedData={() => setReady(true)} className={`h-full w-full object-cover ${photo ? "hidden" : ""}`} />
        {preview && <img src={preview} alt="Captured product" className="absolute inset-0 h-full w-full object-contain" />}
        {error && <p role="alert" className="absolute inset-0 grid place-items-center p-6 text-center text-destructive">{error}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        {photo ? <>
          <Button variant="outline" disabled={saving} onClick={() => setPhoto(null)}><RotateCcw className="h-4 w-4" />Retake</Button>
          <Button disabled={saving} onClick={async () => { setSaving(true); try { await onPhoto(new File([photo], "camera-photo.jpg", { type: "image/jpeg" })); onClose(); } catch (e) { toast.error(e instanceof Error ? e.message : "Upload failed"); } finally { setSaving(false); } }}><Check className="h-4 w-4" />{saving ? "Uploading…" : "Use photo"}</Button>
        </> : <Button disabled={!ready || !!error} onClick={snap}><Camera className="h-4 w-4" />Take photo</Button>}
        <Button variant="ghost" disabled={saving} onClick={onClose}><X className="h-4 w-4" />Cancel</Button>
      </div>
    </DialogContent>
  </Dialog>;
}