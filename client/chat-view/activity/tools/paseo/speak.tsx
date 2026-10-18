import { View } from "react-native";
import { PaseoHero, PromptBlock, asRecord, fieldString } from "../shared";
import { ActionResult } from "./parts";
import type { PaseoRenderProps } from "./parts";

export function SpeakTool({ input, result, palette, styles }: PaseoRenderProps) {
  const inputRecord = asRecord(input);
  return (
    <View style={styles.paseoStack}>
      <PaseoHero
        icon="MicVocal"
        title="Speak"
        color={palette.categoryColors.communication}
        styles={styles}
      />
      <PromptBlock text={fieldString(inputRecord, "text")} label="Message" styles={styles} />
      <ActionResult result={asRecord(result)} palette={palette} styles={styles} />
    </View>
  );
}
