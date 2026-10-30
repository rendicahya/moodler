// Builds a prompt that asks an AI chatbot for questions in Moodle XML, ready to paste back into Moodler.

/** A short, valid Moodle XML example of each question type, written the way Moodler imports it. */
export const XML_EXAMPLES = {
  multichoice: `<question type="multichoice">
  <name><text>Capital of France</text></name>
  <questiontext format="html"><text><![CDATA[<p>What is the capital of France?</p>]]></text></questiontext>
  <generalfeedback format="html"><text><![CDATA[<p>Paris has been the capital of France since 987.</p>]]></text></generalfeedback>
  <defaultgrade>1</defaultgrade>
  <single>true</single>
  <shuffleanswers>true</shuffleanswers>
  <answernumbering>abc</answernumbering>
  <answer fraction="100" format="html"><text>Paris</text><feedback format="html"><text>Correct.</text></feedback></answer>
  <answer fraction="0" format="html"><text>Lyon</text><feedback format="html"><text>Lyon is the third-largest city.</text></feedback></answer>
  <answer fraction="0" format="html"><text>Marseille</text><feedback format="html"><text>Marseille is a port city.</text></feedback></answer>
  <answer fraction="0" format="html"><text>Nice</text><feedback format="html"><text>Nice is on the Riviera.</text></feedback></answer>
</question>`,
  multiresponse: `<question type="multichoice">
  <name><text>Prime numbers</text></name>
  <questiontext format="html"><text><![CDATA[<p>Which of these numbers are prime? Select all that apply.</p>]]></text></questiontext>
  <defaultgrade>1</defaultgrade>
  <single>false</single>
  <shuffleanswers>true</shuffleanswers>
  <answernumbering>abc</answernumbering>
  <answer fraction="50" format="html"><text>2</text></answer>
  <answer fraction="50" format="html"><text>7</text></answer>
  <answer fraction="-50" format="html"><text>9</text></answer>
  <answer fraction="-50" format="html"><text>15</text></answer>
</question>`,
  truefalse: `<question type="truefalse">
  <name><text>Water boils at 100 °C</text></name>
  <questiontext format="html"><text><![CDATA[<p>At sea level, pure water boils at 100 °C.</p>]]></text></questiontext>
  <defaultgrade>1</defaultgrade>
  <answer fraction="100" format="moodle_auto_format"><text>true</text><feedback format="html"><text>Correct.</text></feedback></answer>
  <answer fraction="0" format="moodle_auto_format"><text>false</text><feedback format="html"><text>It does boil at 100 °C at sea level.</text></feedback></answer>
</question>`,
  shortanswer: `<question type="shortanswer">
  <name><text>Largest planet</text></name>
  <questiontext format="html"><text><![CDATA[<p>Which planet is the largest in the Solar System?</p>]]></text></questiontext>
  <defaultgrade>1</defaultgrade>
  <usecase>0</usecase>
  <answer fraction="100" format="moodle_auto_format"><text>Jupiter</text></answer>
  <answer fraction="100" format="moodle_auto_format"><text>Planet Jupiter</text></answer>
</question>`,
  numerical: `<question type="numerical">
  <name><text>Area of a rectangle</text></name>
  <questiontext format="html"><text><![CDATA[<p>A rectangle is 4.5 m long and 2 m wide. What is its area in m²?</p>]]></text></questiontext>
  <defaultgrade>1</defaultgrade>
  <answer fraction="100" format="moodle_auto_format"><text>9</text><tolerance>0.01</tolerance></answer>
</question>`,
  essay: `<question type="essay">
  <name><text>Causes of climate change</text></name>
  <questiontext format="html"><text><![CDATA[<p>Explain two human activities that contribute to climate change.</p>]]></text></questiontext>
  <defaultgrade>5</defaultgrade>
  <responseformat>editor</responseformat>
  <responserequired>1</responserequired>
  <responsefieldlines>10</responsefieldlines>
  <graderinfo format="html"><text><![CDATA[<p>Award marks for, e.g., burning fossil fuels and deforestation, each with a short explanation.</p>]]></text></graderinfo>
</question>`,
  matching: `<question type="matching">
  <name><text>Countries and capitals</text></name>
  <questiontext format="html"><text><![CDATA[<p>Match each country with its capital.</p>]]></text></questiontext>
  <defaultgrade>1</defaultgrade>
  <shuffleanswers>true</shuffleanswers>
  <subquestion format="html"><text>Japan</text><answer><text>Tokyo</text></answer></subquestion>
  <subquestion format="html"><text>Kenya</text><answer><text>Nairobi</text></answer></subquestion>
  <subquestion format="html"><text>Peru</text><answer><text>Lima</text></answer></subquestion>
</question>`,
  cloze: `<question type="cloze">
  <name><text>Water cycle</text></name>
  <questiontext format="html"><text><![CDATA[<p>Water turns into vapour by {1:MULTICHOICE:=evaporation~condensation~precipitation}. Rain is a form of {1:SHORTANSWER:=precipitation}. Water boils at {1:NUMERICAL:=100:0} °C.</p>]]></text></questiontext>
</question>`,
  gapselect: `<question type="gapselect">
  <name><text>Parts of a plant</text></name>
  <questiontext format="html"><text><![CDATA[<p>The [[1]] absorb water, and the [[2]] make food by photosynthesis.</p>]]></text></questiontext>
  <defaultgrade>1</defaultgrade>
  <shuffleanswers>1</shuffleanswers>
  <selectoption><text>roots</text><group>1</group></selectoption>
  <selectoption><text>leaves</text><group>1</group></selectoption>
  <selectoption><text>flowers</text><group>1</group></selectoption>
</question>`,
  ddwtos: `<question type="ddwtos">
  <name><text>Order of operations</text></name>
  <questiontext format="html"><text><![CDATA[<p>In 2 + 3 × 4 you first [[1]] and then [[2]].</p>]]></text></questiontext>
  <defaultgrade>1</defaultgrade>
  <shuffleanswers>1</shuffleanswers>
  <dragbox><text>multiply</text><group>1</group></dragbox>
  <dragbox><text>add</text><group>1</group></dragbox>
  <dragbox><text>divide</text><group>1</group></dragbox>
</question>`,
  ordering: `<question type="ordering">
  <name><text>Planets by distance</text></name>
  <questiontext format="html"><text><![CDATA[<p>Put the planets in order, nearest to the Sun first.</p>]]></text></questiontext>
  <defaultgrade>1</defaultgrade>
  <layouttype>VERTICAL</layouttype>
  <selecttype>ALL</selecttype>
  <gradingtype>ABSOLUTE_POSITION</gradingtype>
  <answer fraction="1" format="html"><text>Mercury</text></answer>
  <answer fraction="2" format="html"><text>Venus</text></answer>
  <answer fraction="3" format="html"><text>Earth</text></answer>
  <answer fraction="4" format="html"><text>Mars</text></answer>
</question>`,
  description: `<question type="description">
  <name><text>Reading passage</text></name>
  <questiontext format="html"><text><![CDATA[<p>Read the passage below before answering the next questions.</p>]]></text></questiontext>
</question>`,
};

/** The question types offered in the prompt builder, with how the AI should write each. */
export const PROMPT_TYPES = [
  {
    type: 'multichoice',
    label: 'Multiple choice (one answer)',
    rule: 'type="multichoice" with <single>true</single>; exactly one answer with fraction="100", the others fraction="0"; plausible distractors of similar length and style to the correct answer; put the correct answer in a different position from question to question, evenly spread.',
  },
  { type: 'multiresponse', label: 'Multiple choice (several answers)', rule: 'type="multichoice" with <single>false</single>; the correct answers\' fractions add up to 100 and wrong ones are negative.' },
  { type: 'truefalse', label: 'True / False', rule: 'type="truefalse"; two answers whose text is exactly "true" and "false", the correct one with fraction="100".' },
  { type: 'shortanswer', label: 'Short answer', rule: 'type="shortanswer"; a one-word or short-phrase answer, listing accepted variants as extra answers with fraction="100".' },
  { type: 'numerical', label: 'Numerical', rule: 'type="numerical"; the answer is a plain number (dot as decimal separator) with a <tolerance>.' },
  { type: 'essay', label: 'Essay', rule: 'type="essay"; put a marking guide for the teacher in <graderinfo>.' },
  { type: 'matching', label: 'Matching', rule: 'type="matching"; at least 3 <subquestion> items, each with its matching <answer>.' },
  { type: 'cloze', label: 'Embedded answers (Cloze)', rule: 'type="cloze"; gaps written inside the question text as {1:MULTICHOICE:=right~wrong~wrong}, {1:SHORTANSWER:=answer} or {1:NUMERICAL:=number:tolerance}.' },
  { type: 'gapselect', label: 'Select missing words', rule: 'type="gapselect"; gaps written as [[1]], [[2]], … where the number is the position of the right <selectoption> in the list; add extra wrong options.' },
  { type: 'ddwtos', label: 'Drag and drop into text', rule: 'type="ddwtos"; gaps written as [[1]], [[2]], … where the number is the position of the right <dragbox> in the list; add extra wrong boxes.' },
  { type: 'ordering', label: 'Ordering', rule: 'type="ordering"; the <answer> items listed in the correct order, with fraction="1", "2", "3", …' },
];

export const DIFFICULTIES = [
  { value: 'easy', label: 'Easy', text: 'easy (recall and basic understanding)' },
  { value: 'medium', label: 'Medium', text: 'medium (understanding and application)' },
  { value: 'hard', label: 'Hard', text: 'hard (analysis, evaluation and problem solving)' },
  { value: 'mixed', label: 'Mixed', text: 'a mix of easy, medium and hard' },
];

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * @param {object} o
 * @param {string} o.topic       what the questions are about
 * @param {string} [o.material]  source text the questions must be based on
 * @param {{ name: string, text?: string }[]} [o.files]  material files: their text goes into the prompt, or, without
 *   text, they are attached to the chat message by the user and only named in the prompt
 * @param {Record<string, number>} o.counts  number of questions per PROMPT_TYPES type
 * @param {string} [o.difficulty]
 * @param {string} [o.language]
 * @param {string} [o.audience]
 * @param {string} [o.category]  Moodle question bank category
 * @param {boolean} [o.feedback] ask for feedback on answers and a general explanation
 * @param {string} [o.extra]     any further instructions
 */
export function buildPrompt(o) {
  const chosen = PROMPT_TYPES.filter((t) => o.counts[t.type] > 0);
  const total = chosen.reduce((s, t) => s + o.counts[t.type], 0);
  const difficulty = DIFFICULTIES.find((d) => d.value === o.difficulty);
  const topic = o.topic.trim();
  const material = o.material?.trim();
  const files = (o.files ?? []).filter((f) => f.text?.trim());
  const attached = (o.files ?? []).filter((f) => !f.text?.trim());
  const hasSource = !!(material || files.length || attached.length);
  const quote = (list) => list.map((f) => `"${f.name}"`).join(', ');
  const L = [];

  L.push(`You are an experienced teacher and assessment writer. Write ${plural(total, 'quiz question')}${topic ? ` about: ${topic}` : ''}.`);
  if (attached.length) {
    L.push(
      `I have attached ${attached.length === 1 ? 'a file' : `${attached.length} files`} to this message: ${quote(attached)}. Read ${attached.length === 1 ? 'it' : 'them'} in full and use ${attached.length === 1 ? 'it' : 'them'} as source material.`
    );
  }
  L.push('');

  const req = [];
  if (o.audience?.trim()) req.push(`Audience: ${o.audience.trim()}.`);
  if (difficulty) req.push(`Difficulty: ${difficulty.text}.`);
  if (o.language?.trim()) req.push(`Write every question, answer and feedback in ${o.language.trim()}.`);
  req.push(
    'Questions must be factually correct, unambiguous and independent of each other. Every question must have a clearly correct answer.',
    'Cover different parts of the topic rather than asking the same thing twice.'
  );
  if (hasSource) {
    const where = [material || files.length ? 'below' : '', attached.length ? `in the attached file${attached.length === 1 ? '' : 's'}` : ''].filter(Boolean).join(' and ');
    req.push(`Base the questions only on the source material ${where}; do not test anything it does not contain.`);
    if (files.length + attached.length + (material ? 1 : 0) > 1) req.push('Spread the questions over all of the source material, not just the first part.');
  }
  if (o.feedback) {
    req.push(
      'Give each question a <generalfeedback> that explains the correct answer, and give multiple-choice and true/false answers a short <feedback> saying why they are right or wrong.'
    );
  }
  if (o.extra?.trim()) req.push(o.extra.trim());
  L.push('Requirements:', ...req.map((r) => `- ${r}`), '');

  L.push('Questions to write:');
  for (const t of chosen) L.push(`- ${o.counts[t.type]} × ${t.label}: ${t.rule}`);
  L.push('');

  L.push(
    'Output format: Moodle XML only, so it can be imported directly.',
    '- Reply with one complete XML document in a single code block, starting with <?xml version="1.0" encoding="UTF-8"?> and a <quiz> root element. No text before or after it.',
    '- Give every question a short, descriptive <name>.',
    '- Put question text in <![CDATA[ ]]> as simple HTML (<p>, <strong>, <em>, <ul>, <li>, <code>, <sub>, <sup>). Escape any other &, < and > as &amp;, &lt; and &gt;.',
    '- Fractions are percentages: fraction="100" is fully correct, fraction="0" is wrong.',
    '- Do not include images, links or <file> elements.'
  );
  if (o.category?.trim()) {
    L.push(
      `- Start the quiz with this category element: <question type="category"><category><text>$course$/top/${escXml(o.category.trim())}</text></category></question>`
    );
  }
  L.push('');

  L.push(`Follow the structure of ${chosen.length === 1 ? 'this example' : 'these examples'} exactly (the content is only an illustration):`, '', '```xml');
  for (const t of chosen) L.push(XML_EXAMPLES[t.type]);
  L.push('```');

  if (material) L.push('', 'Source material:', '"""', material, '"""');
  for (const f of files) L.push('', `Source material from the file "${f.name}":`, '"""', f.text.trim(), '"""');
  return L.join('\n');
}

const escXml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
