import type { Metadata } from "next";

import { DemoClient } from "./demo-client";

export const metadata: Metadata = {
  title: "ONE Portrait Demo Film",
  description: "A cinematic demo flow for the ONE Portrait reveal experience.",
};

export default function DemoPage(): React.ReactElement {
  return <DemoClient />;
}
