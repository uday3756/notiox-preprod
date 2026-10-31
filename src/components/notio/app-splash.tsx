import { LayoutGroup, motion } from "framer-motion";
import { NotioLogo } from "@/components/notio/logo";
import { TextRotate } from "@/components/ui/text-rotate";

const SPLASH_PHRASES = [
  "clear",
  "mapped",
  "simple",
  "focused",
  "yours",
];

/**
 * App-open splash — logo + rotating tagline while session is resolved.
 */
export function AppSplash() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background bg-glow px-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", damping: 22, stiffness: 280 }}
      >
        <NotioLogo className="text-3xl sm:text-4xl" />
      </motion.div>

      <LayoutGroup>
        <motion.p
          className="flex max-w-[20rem] flex-wrap items-center justify-center text-center text-lg font-light text-muted-foreground sm:text-xl"
          layout
        >
          <motion.span
            className="pt-0.5"
            layout
            transition={{ type: "spring", damping: 30, stiffness: 400 }}
          >
            Making it{" "}
          </motion.span>
          <TextRotate
            texts={SPLASH_PHRASES}
            mainClassName="overflow-hidden rounded-lg bg-primary px-2 py-0.5 font-medium text-primary-foreground justify-center sm:px-2.5 sm:py-1"
            staggerFrom="last"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "-120%" }}
            staggerDuration={0.025}
            splitLevelClassName="overflow-hidden pb-0.5"
            transition={{ type: "spring", damping: 30, stiffness: 400 }}
            rotationInterval={1600}
          />
        </motion.p>
      </LayoutGroup>
    </div>
  );
}
