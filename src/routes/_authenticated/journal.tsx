import { createFileRoute, redirect } from "@tanstack/react-router";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FEATURE_FLAGS } from "@/lib/feature-flags";

/** Keep the original redirect when the new workflow is disabled. */
export const Route = createFileRoute("/_authenticated/journal")({
  beforeLoad: () => {
    if(!FEATURE_FLAGS.workflow)throw redirect({ to: "/home", replace: true });
  },
  component: JournalPage,
});

function JournalPage() {
  const {user}=Route.useRouteContext();
  const query=useQuery({queryKey:["journal",user.id],queryFn:async()=>{
    const {data,error}=await supabase.from("journal_entries").select("id,content,created_at").eq("user_id",user.id).order("created_at",{ascending:false});
    if(error)throw error;return data;
  }});
  return <main className="notiox-screen mx-auto max-w-3xl px-5 py-8 pb-32"><h1 className="text-2xl font-semibold">Journal</h1>
    {query.isLoading&&<p className="mt-6" role="status">Loading entries...</p>}
    {query.isError&&<p className="mt-6" role="alert">Couldn't load your journal. <button onClick={()=>void query.refetch()}>Try again</button></p>}
    {query.data?.length===0&&<p className="mt-6 text-muted-foreground">No journal entries yet.</p>}
    {query.data?.map(entry=><article key={entry.id} className="mt-6 border-t border-border pt-5"><time className="text-sm text-muted-foreground" dateTime={entry.created_at}>{new Date(entry.created_at).toLocaleDateString()}</time><p className="mt-3 whitespace-pre-wrap break-words">{entry.content}</p></article>)}
  </main>;
}
