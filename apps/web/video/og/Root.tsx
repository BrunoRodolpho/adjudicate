import { Composition } from "remotion";
import { HomepageOG } from "./HomepageOG";
import { ArchitectureOG } from "./ArchitectureOG";
import { ComparisonsOG } from "./ComparisonsOG";
import { IntrospectionOG } from "./IntrospectionOG";
import { CapabilitiesOG } from "./CapabilitiesOG";
import { ConsoleOG } from "./ConsoleOG";
import { DeployOG } from "./DeployOG";
import { DataFlowOG } from "./DataFlowOG";
import { TransparencyOG } from "./TransparencyOG";
import {
  CapabilityDetailOG,
  capabilityDetailDefaultProps,
} from "./CapabilityDetailOG";

/**
 * Composition registry for the four per-route OG images.
 *
 * Each is a single-frame still at the standard OpenGraph dimensions
 * (1200 × 630). Rendered via `remotion still` to PNG and committed to
 * `apps/web/public/og-{route}.png`.
 *
 * Wired into Next.js metadata's `openGraph.images` per route so social
 * platforms (Twitter, LinkedIn, etc.) display the right image when the
 * URL is shared.
 */

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;
const FPS = 30;

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="HomepageOG"
        component={HomepageOG}
        durationInFrames={1}
        fps={FPS}
        width={OG_WIDTH}
        height={OG_HEIGHT}
      />
      <Composition
        id="ArchitectureOG"
        component={ArchitectureOG}
        durationInFrames={1}
        fps={FPS}
        width={OG_WIDTH}
        height={OG_HEIGHT}
      />
      <Composition
        id="ComparisonsOG"
        component={ComparisonsOG}
        durationInFrames={1}
        fps={FPS}
        width={OG_WIDTH}
        height={OG_HEIGHT}
      />
      <Composition
        id="IntrospectionOG"
        component={IntrospectionOG}
        durationInFrames={1}
        fps={FPS}
        width={OG_WIDTH}
        height={OG_HEIGHT}
      />
      <Composition
        id="CapabilitiesOG"
        component={CapabilitiesOG}
        durationInFrames={1}
        fps={FPS}
        width={OG_WIDTH}
        height={OG_HEIGHT}
      />
      <Composition
        id="ConsoleOG"
        component={ConsoleOG}
        durationInFrames={1}
        fps={FPS}
        width={OG_WIDTH}
        height={OG_HEIGHT}
      />
      <Composition
        id="DeployOG"
        component={DeployOG}
        durationInFrames={1}
        fps={FPS}
        width={OG_WIDTH}
        height={OG_HEIGHT}
      />
      <Composition
        id="DataFlowOG"
        component={DataFlowOG}
        durationInFrames={1}
        fps={FPS}
        width={OG_WIDTH}
        height={OG_HEIGHT}
      />
      <Composition
        id="TransparencyOG"
        component={TransparencyOG}
        durationInFrames={1}
        fps={FPS}
        width={OG_WIDTH}
        height={OG_HEIGHT}
      />
      <Composition
        id="CapabilityDetailOG"
        component={CapabilityDetailOG}
        durationInFrames={1}
        fps={FPS}
        width={OG_WIDTH}
        height={OG_HEIGHT}
        defaultProps={capabilityDetailDefaultProps}
      />
    </>
  );
};
