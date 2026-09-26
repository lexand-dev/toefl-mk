import type { RevisionInput } from "./schemas";

// Original draft for a human editor to verify for factual accuracy, ambiguity and rights.
export const exampleR3: RevisionInput = {
  publicContent: {
    title: "How Rain Gardens Can Cool City Streets",
    passage: "After a storm, water falling on a paved street usually flows quickly toward a drain. A rain garden changes part of that route: a shallow depression collects runoff from nearby surfaces and lets it soak into the soil. The plants and soil retain moisture for a time. When water evaporates from the soil and leaves, it takes thermal energy from its surroundings. This process can cool the nearby air, although the effect varies with shade, wind, and the amount of available water. The garden does not replace a drainage system: during heavy rain, excess water still needs a safe outlet. Designers therefore study both how quickly the soil absorbs water and where water will go when the garden is full. A well-placed rain garden can reduce some runoff and add vegetation, but it cannot guarantee the same drop in temperature on every street.",
  },
  provenanceNote: "Texto original redactado para esta plataforma; pendiente de comprobación humana de exactitud científica y claridad.",
  rightsNote: "Texto original de la plataforma; confirmar derechos y aprobación editorial antes de publicar.",
  items: [
    { ordinal: 1, responseKind: "single_choice", publicPrompt: { question: "What is the main function of the shallow depression described in the passage?", options: [{ id: "a", text: "To collect runoff and let it soak into the soil" }, { id: "b", text: "To eliminate all need for drainage" }, { id: "c", text: "To prevent water from evaporating" }, { id: "d", text: "To increase wind speed" }] }, pointsPossible: 1, key: { acceptedAnswers: ["a"], scoringRule: "exact", explanation: "The depression collects runoff from nearby surfaces and allows it to infiltrate the soil." } },
    { ordinal: 2, responseKind: "single_choice", publicPrompt: { question: "According to the passage, why might nearby air become cooler?", options: [{ id: "a", text: "The pavement becomes thicker" }, { id: "b", text: "Evaporation takes thermal energy from the surroundings" }, { id: "c", text: "The drain stops the wind" }, { id: "d", text: "Rain always creates shade" }] }, pointsPossible: 1, key: { acceptedAnswers: ["b"], scoringRule: "exact", explanation: "Evaporation from soil and leaves consumes thermal energy from the surrounding area." } },
    { ordinal: 3, responseKind: "single_choice", publicPrompt: { question: "What does the author say about heavy rain?", options: [{ id: "a", text: "It never affects rain gardens" }, { id: "b", text: "It makes soil testing unnecessary" }, { id: "c", text: "Excess water needs a safe outlet" }, { id: "d", text: "It guarantees equal cooling on all streets" }] }, pointsPossible: 1, key: { acceptedAnswers: ["c"], scoringRule: "exact", explanation: "The passage warns that excess water must have a safe outlet when the garden fills up." } },
  ],
  assets: [], reviewContent: null,
};
