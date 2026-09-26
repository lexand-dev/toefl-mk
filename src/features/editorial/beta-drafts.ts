import { exampleR3 } from "./example-r3";
import type { RevisionInput, TypeCode } from "./schemas";

type Draft = { slug: string; typeCode: TypeCode; topic: string; difficulty: "intro" | "intermediate"; revision: RevisionInput };
const provenance = "Texto y actividades originales creados para el banco beta TOEFL; pendientes de revisión factual, pedagógica y lingüística por una persona editora.";
const rights = "Contenido escrito original de esta plataforma; confirmar atribución y derechos de todos los recursos antes de publicar.";

function r1(slug: string, title: string, pieces: [string, string, string][], ending: string): Draft {
  const segments: ({ kind: "text"; text: string } | { kind: "gap"; gapId: string; stem: string })[] = [];
  const items: RevisionInput["items"] = [];
  for (const [index, [before, stem, suffix]] of pieces.entries()) {
    segments.push({ kind: "text", text: before }, { kind: "gap", gapId: `gap-${index + 1}`, stem });
    items.push({ ordinal: index + 1, responseKind: "fill_word", publicPrompt: { gapId: `gap-${index + 1}` }, pointsPossible: 1,
      key: { acceptedAnswers: [suffix], scoringRule: "case_insensitive", explanation: `En esta frase, «${stem}${suffix}» completa la idea en el contexto del pasaje.` } });
  }
  segments.push({ kind: "text", text: ending });
  return { slug, typeCode: "R1", topic: title, difficulty: "intro", revision: { publicContent: { title, segments }, provenanceNote: provenance, rightsNote: rights, items, assets: [], reviewContent: null } };
}

function w1(slug: string, context: string, words: string[]): Draft {
  const tokens = words.map((text, index) => ({ id: `token-${index + 1}`, text }));
  return { slug, typeCode: "W1", topic: "Construcción de oraciones", difficulty: "intro", revision: {
    publicContent: { context }, provenanceNote: provenance, rightsNote: rights,
    items: [{ ordinal: 1, responseKind: "token_order", publicPrompt: { instruction: "Arrange every fragment into a natural sentence.", tokens }, pointsPossible: 1,
      key: { acceptedAnswers: tokens.map((token) => token.id), scoringRule: "exact", explanation: `El orden conecta sujeto, verbo y complementos en «${words.join(" ")}».` } }],
    assets: [], reviewContent: null,
  } };
}

function w2(slug: string, situation: string, recipient: string, task: string): Draft {
  return { slug, typeCode: "W2", topic: "Correo académico", difficulty: "intro", revision: {
    publicContent: { situation, recipient, task }, provenanceNote: provenance, rightsNote: rights,
    items: [{ ordinal: 1, responseKind: "free_text", publicPrompt: { instruction: "Write a polite, clear email that addresses every part of the task." }, pointsPossible: 0, key: null }],
    assets: [], reviewContent: null,
  } };
}

function l2(slug: string, title: string, description: string, transcript: string, questions: { question: string; options: [string, string, string]; answer: "a" | "b" | "c"; explanation: string }[]): Draft {
  return { slug, typeCode: "L2", topic: "Conversación universitaria", difficulty: "intro", revision: {
    publicContent: { title, description }, provenanceNote: `${provenance} El audio aún debe grabarse y revisarse.`, rightsNote: `${rights} Los derechos de la grabación deben confirmarse antes de publicar.`,
    items: questions.map((item, index) => ({ ordinal: index + 1, responseKind: "single_choice", publicPrompt: { question: item.question,
      options: item.options.map((text, optionIndex) => ({ id: ["a", "b", "c"][optionIndex], text })) }, pointsPossible: 1,
    key: { acceptedAnswers: [item.answer], scoringRule: "exact", explanation: item.explanation } })),
    assets: [], reviewContent: { transcript },
  } };
}

const riverR3: Draft = { slug: "r3-river-banks", typeCode: "R3", topic: "Ecología fluvial", difficulty: "intermediate", revision: {
  publicContent: { title: "Why Some Riverbanks Are Left to Change", passage: "A riverbank may look stable, but flowing water continuously moves small particles of soil. After a storm, faster water can remove sediment from an outside bend and deposit it along a slower inside bend. Engineers sometimes reinforce banks near bridges or buildings, where erosion could threaten people and infrastructure. In less developed areas, however, allowing a river some room to shift can create gravel bars and shallow habitats for fish and insects. This approach requires careful planning: paths and nearby farms may need a buffer zone, and a restored bank does not eliminate all flood risk. Researchers compare maps collected over many years to see whether a project changes habitats without increasing danger downstream. The decision is therefore not simply whether to control the river, but where restraint and flexibility serve different goals." },
  provenanceNote: provenance, rightsNote: rights, assets: [], reviewContent: null,
  items: [
    { ordinal: 1, responseKind: "single_choice", publicPrompt: { question: "Where does the passage say sediment may accumulate?", options: [{ id: "a", text: "Along a slower inside bend" }, { id: "b", text: "Only beneath a bridge" }, { id: "c", text: "On an outside bend with faster water" }] }, pointsPossible: 1, key: { acceptedAnswers: ["a"], scoringRule: "exact", explanation: "The passage contrasts erosion on fast outside bends with deposition on slower inside bends." } },
    { ordinal: 2, responseKind: "single_choice", publicPrompt: { question: "Why might planners allow a riverbank to shift in a less developed area?", options: [{ id: "a", text: "It guarantees there will be no floods" }, { id: "b", text: "It can create habitats while leaving space for change" }, { id: "c", text: "It removes the need for long-term maps" }] }, pointsPossible: 1, key: { acceptedAnswers: ["b"], scoringRule: "exact", explanation: "Allowing space for movement can create gravel bars and shallow habitats, but risks still require planning." } },
  ],
} };

export const betaDrafts: Draft[] = [
  r1("r1-night-gardens", "Gardens after Sunset", [
    ["Some flowers release a stronger sc", "en", "t"], [" at night, attracting insects that are most ac", "ti", "ve"], [" after sunset. A small garden can pro", "vi", "de"], [" food for these insects while giving visitors a chance to ob", "ser", "ve"],
  ], " their behavior without bright lights."),
  r1("r1-city-trees", "Trees on Busy Streets", [
    ["Trees beside a street can pr", "ovi", "de"], [" shade for pedestrians. Their leaves also in", "ter", "cept"], [" some rain before it reaches the ground. City workers must se", "lec", "t"], [" species that can to", "ler", "ate"],
  ], " heat and limited soil."),
  { slug: "r3-rain-gardens", typeCode: "R3", topic: "Infraestructura verde", difficulty: "intermediate", revision: exampleR3 },
  riverR3,
  l2("l2-library-room", "Booking a Library Room", "A student asks a librarian about reserving a quiet group room.",
    "Student: Hi, can I reserve a group room for our ecology meeting on Thursday?\nLibrarian: Yes. Rooms can be booked for two hours, but you need a student card to make the reservation.\nStudent: We need to show a short video. Is there a screen in the room?\nLibrarian: Room B has a screen. Please book that room through the library website, and bring your own laptop.\nStudent: Great. I'll reserve Room B online and bring my card and laptop.", [
      { question: "What does the librarian say the student needs to reserve a room?", options: ["A student card", "A faculty signature", "A printed meeting agenda"], answer: "a", explanation: "The librarian explicitly says a student card is needed to make the reservation." },
      { question: "Which room should the student book to show a video?", options: ["The room nearest the entrance", "Room B", "Any room in the library"], answer: "b", explanation: "Room B has the screen mentioned in the conversation." },
    ]),
  l2("l2-lab-hours", "Changing Lab Hours", "A student checks the new schedule with a laboratory assistant.",
    "Student: I usually come to the lab on Friday afternoon. Will it be open this week?\nAssistant: Not this Friday. We are checking the ventilation system, so the lab will close at noon.\nStudent: Can I finish my project on Saturday instead?\nAssistant: Yes, the lab will open Saturday from ten to two. Sign in at the front desk before you enter.\nStudent: Thanks. I'll come Saturday morning and sign in first.", [
      { question: "Why will the lab close early on Friday?", options: ["The ventilation system is being checked", "The assistant is teaching a class", "The front desk will be closed"], answer: "a", explanation: "The assistant states that a ventilation check requires the Friday closure." },
      { question: "What must the student do before entering on Saturday?", options: ["Send an email to a professor", "Collect a new laptop", "Sign in at the front desk"], answer: "c", explanation: "The assistant tells the student to sign in at the front desk." },
    ]),
  w1("w1-study-group", "Two classmates discuss a study group.", ["Our", "study", "group", "meets", "on", "Tuesday."]),
  w1("w1-lab-notes", "A tutor asks about laboratory records.", ["Please", "bring", "your", "lab", "notes", "tomorrow."]),
  w1("w1-map", "A student describes a map.", ["The", "new", "map", "shows", "the", "river."]),
  w1("w1-library", "A librarian answers a question.", ["You", "can", "borrow", "this", "book", "today."]),
  w1("w1-bus", "Two students plan their commute.", ["The", "campus", "bus", "leaves", "at", "eight."]),
  w1("w1-garden", "A professor talks about the garden.", ["These", "flowers", "grow", "well", "in", "shade."]),
  w1("w1-recycling", "Volunteers discuss a campus event.", ["We", "will", "collect", "paper", "after", "class."]),
  w1("w1-repeated-that", "A tutor explains that repeating a word can still form a grammatical sentence.", ["I", "believe", "that", "that", "idea", "can", "work."]),
  w1("w1-poster", "A student asks for design feedback.", ["Your", "poster", "explains", "the", "idea", "clearly."]),
  w1("w1-schedule", "A student checks an appointment.", ["My", "appointment", "starts", "at", "three", "o'clock."]),
  w2("w2-course-advice", "You want to take an elective but are unsure whether it fits your schedule.", "An academic adviser", "Ask about the course requirements, explain your schedule concern, and request a short meeting."),
  w2("w2-missing-book", "The required book for your class is not on the library shelf.", "A librarian", "Describe the missing book, explain when you need it, and ask about another way to access it."),
  w2("w2-volunteer-event", "You signed up for a campus volunteer event, but your class schedule has changed.", "The event coordinator", "Explain the conflict, suggest a different time you could help, and ask whether that would be useful."),
];
