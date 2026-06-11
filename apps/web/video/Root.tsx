import { Composition } from "remotion";
import {
  DURATION_FRAMES,
  FPS,
  HEIGHT,
  HowItWorksHero,
  WIDTH,
} from "./HowItWorksHero";
import {
  DURATION_FRAMES as HERO_DURATION,
  FPS as HERO_FPS,
  HEIGHT as HERO_HEIGHT,
  HeroKernelLoop,
  WIDTH as HERO_WIDTH,
} from "./HeroKernelLoop";
import {
  DURATION_FRAMES as RECEIPT_DURATION,
  FPS as RECEIPT_FPS,
  HEIGHT as RECEIPT_HEIGHT,
  ReceiptMaterialize,
  WIDTH as RECEIPT_WIDTH,
} from "./ReceiptMaterialize";
import {
  ConsoleTailLoop,
  DURATION_FRAMES as CONSOLE_DURATION,
  FPS as CONSOLE_FPS,
  HEIGHT as CONSOLE_HEIGHT,
  WIDTH as CONSOLE_WIDTH,
} from "./ConsoleTailLoop";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="HowItWorksHero"
        component={HowItWorksHero}
        durationInFrames={DURATION_FRAMES}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
      <Composition
        id="HeroKernelLoop"
        component={HeroKernelLoop}
        durationInFrames={HERO_DURATION}
        fps={HERO_FPS}
        width={HERO_WIDTH}
        height={HERO_HEIGHT}
      />
      <Composition
        id="ReceiptMaterialize"
        component={ReceiptMaterialize}
        durationInFrames={RECEIPT_DURATION}
        fps={RECEIPT_FPS}
        width={RECEIPT_WIDTH}
        height={RECEIPT_HEIGHT}
      />
      <Composition
        id="ConsoleTailLoop"
        component={ConsoleTailLoop}
        durationInFrames={CONSOLE_DURATION}
        fps={CONSOLE_FPS}
        width={CONSOLE_WIDTH}
        height={CONSOLE_HEIGHT}
      />
    </>
  );
};
