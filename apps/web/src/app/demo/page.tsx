import type { Metadata } from "next";

import { DemoClient } from "./demo-client";

export const metadata: Metadata = {
  title: "ONE Portrait Takeru Demo Unit",
  description: "A fixed Takeru demo unit shell for the ONE Portrait flow.",
};

export default function DemoPage(): React.ReactElement {
  return <DemoClient />;
}
