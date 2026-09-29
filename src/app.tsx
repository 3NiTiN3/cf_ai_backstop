import { Suspense, useState } from "react";
import { Chat } from "./ui/chat";
import { Dashboard } from "./ui/dashboard";
import { Header } from "./ui/header";
import { useOverview } from "./ui/use-overview";
import type { Namespace } from "./gateway/routes";

export default function App() {
  const [namespace, setNamespace] = useState<Namespace>("demo");
  const overview = useOverview(namespace);

  return (
    <div className="flex flex-col min-h-screen lg:h-screen bg-kumo-elevated">
      <Header
        namespace={namespace}
        onNamespaceChange={setNamespace}
        overview={overview.data}
      />
      <main className="flex-1 grid lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_26rem] xl:grid-cols-[minmax(0,1fr)_32rem]">
        <div className="relative min-w-0 lg:min-h-0 lg:overflow-hidden">
          <Dashboard namespace={namespace} overview={overview} />
        </div>
        <aside
          aria-label="Ops chat"
          className="min-w-0 h-[85svh] lg:h-auto lg:min-h-0 border-t lg:border-t-0 lg:border-l border-kumo-line"
        >
          <Suspense
            fallback={
              <div className="flex items-center justify-center h-full text-kumo-inactive">
                Loading...
              </div>
            }
          >
            <Chat namespace={namespace} />
          </Suspense>
        </aside>
      </main>
    </div>
  );
}
