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
    </>
  );
};
