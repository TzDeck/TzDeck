import React from "react";
import { TezIcon } from "./icons";

/**
 * Prints a string with every ꜩ drawn as TezIcon, so copy like the rarity
 * rules can keep the tez sign in its text without depending on a font that
 * has it. Screen readers hear "tez" in its place. Each word holding a sign
 * stays on one line, as it did when the sign was a character: a line can
 * otherwise break between the icon and the "+" after it.
 */
export default function TezText({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\S*ꜩ\S*)/).map((chunk, index) =>
        chunk.includes("ꜩ") ? (
          <span key={index} className="whitespace-nowrap">
            {chunk.split("ꜩ").map((part, partIndex) => (
              <React.Fragment key={partIndex}>
                {partIndex > 0 ? <TezIcon label="tez" /> : null}
                {part}
              </React.Fragment>
            ))}
          </span>
        ) : (
          chunk
        ),
      )}
    </>
  );
}
