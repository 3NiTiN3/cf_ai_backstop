import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { PanelBody } from "../../src/ui/panel-body";

function render(data: string[] | null, error: string | null): string {
  return renderToStaticMarkup(
    <PanelBody data={data} error={error} what="repos" skeletonClass="h-40">
      {(rows) => <p>{rows.join(",")}</p>}
    </PanelBody>,
  );
}

it("shows a skeleton while loading", () => {
  const html = render(null, null);
  expect(html).toContain('role="status"');
  expect(html).toContain("Loading repos");
});

it("shows the error when nothing has loaded", () => {
  expect(render(null, "boom")).toContain("Could not load repos: boom");
});

it("keeps showing data when a later refresh fails", () => {
  const html = render(["demo/api"], "boom");
  expect(html).toContain("demo/api");
  expect(html).toContain(
    "Could not refresh repos: boom. Showing the last data loaded.",
  );
});
