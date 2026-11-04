import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Timer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useStaff } from "@/hooks/use-staff";

export function useClockStatus() {
  const { data: me } = useStaff();
  return useQuery({
    queryKey: ["clock", me?.id],
    enabled: !!me?.id,
    queryFn: async () => {
      const { data } = await supabase.from("time_clock").select("id, clock_in").eq("user_id", me!.id).is("clock_out", null).maybeSingle();
      return data;
    },
  });
}

export function ClockButton() {
  const qc = useQueryClient();
  const { data: open, isLoading } = useClockStatus();
  async function toggle() {
    const { error } = await supabase.rpc(open ? "clock_out" : "clock_in");
    if (error) { toast.error(error.message); return; }
    toast.success(open ? "Clocked out" : "Clocked in");
    qc.invalidateQueries({ queryKey: ["clock"] });
  }
  if (isLoading) return null;
  return (
    <button onClick={toggle} className="flex items-center gap-2 rounded-lg bg-sidebar-accent px-3 py-2 text-sm font-semibold hover:opacity-90">
      <Timer className="h-4 w-4" />
      {open ? `Clock out (in since ${new Date(open.clock_in).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })})` : "Clock in"}
    </button>
  );
}
