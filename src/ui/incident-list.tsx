import { useState } from "react";
import { Badge, Button } from "@cloudflare/kumo";
import type { Namespace } from "../gateway/routes";
import {
  incidentFigures,
  incidentWindow,
  useIncidents,
  type Incident,
} from "./incident-data";
import { PanelBody } from "./panel-body";

const FIRST_SHOWN = 5;

export function IncidentList({ namespace }: { namespace: Namespace }) {
  const { data, error } = useIncidents(namespace);
  const [showAll, setShowAll] = useState(false);
  return (
    <PanelBody data={data} error={error} what="incidents" skeletonClass="h-40">
      {(incidents) =>
        incidents.length === 0 ? (
          <p className="text-body text-kumo-subtle">
            No incidents yet. One starts when a breaker opens.
          </p>
        ) : (
          <div className="space-y-3">
            <ul className="space-y-3">
              {(showAll ? incidents : incidents.slice(0, FIRST_SHOWN)).map(
                (incident) => (
                  <IncidentCard key={incident.id} incident={incident} />
                ),
              )}
            </ul>
            {!showAll && incidents.length > FIRST_SHOWN && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowAll(true)}
              >
                Show {incidents.length - FIRST_SHOWN} more
              </Button>
            )}
          </div>
        )
      }
    </PanelBody>
  );
}

function IncidentCard({ incident }: { incident: Incident }) {
  const ongoing = incident.endedAt === null;
  return (
    <li className="animate-enter space-y-3 rounded-xl border border-kumo-line bg-kumo-base px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <h3 className="text-heading text-kumo-default">{incident.repo}</h3>
          {ongoing && <Badge variant="error">Ongoing</Badge>}
        </div>
        <span className="font-figures text-caption text-kumo-subtle">
          {incidentWindow(incident)}
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {incidentFigures(incident).map(([label, value]) => (
          <div key={label}>
            <dt className="text-caption text-kumo-subtle">{label}</dt>
            <dd className="font-figures text-body text-kumo-default">
              {value}
            </dd>
          </div>
        ))}
      </dl>
      {incident.summary && (
        <p className="text-body text-kumo-default">{incident.summary}</p>
      )}
    </li>
  );
}
