import type { Sql } from "./db";

// Seeds the database on first run only (when there are no members yet).
// Creates a sample family, the 4 personas, the Family space + a Personal space
// per member, and ~12 memories — including "Mum's 60th" so the recall demo
// lands immediately, and a clearly private memory to show the privacy split.
//
// Runs inside a transaction guarded by a Postgres advisory lock + an empty-table
// re-check, so two Cloudflare isolates hitting an empty DB at once can't both seed.
export async function seedIfEmpty(base: Sql): Promise<void> {
  await base.begin(async (sql) => {
    // Serialise first-run seeding across connections.
    await sql`SELECT pg_advisory_xact_lock(728041)`;

    const [{ n }] = await sql<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM members`;
    if (n > 0) return;

    // --- members ---
    const ins = async (name: string, avatar: string) => {
      const [row] = await sql<{ id: number }[]>`
        INSERT INTO members (name, avatar) VALUES (${name}, ${avatar}) RETURNING id`;
      return row.id;
    };
    const dad = await ins("Dad", "👨");
    const mum = await ins("Mum", "👩");
    const teen = await ins("Ava", "🧒");
    const kid = await ins("Leo", "👦");

    // --- spaces ---
    const [familyRow] = await sql<{ id: number }[]>`
      INSERT INTO spaces (type, owner_member_id) VALUES ('family', NULL) RETURNING id`;
    const familySpace = familyRow.id;

    const personal: Record<number, number> = {};
    for (const m of [dad, mum, teen, kid]) {
      const [row] = await sql<{ id: number }[]>`
        INSERT INTO spaces (type, owner_member_id) VALUES ('personal', ${m}) RETURNING id`;
      personal[m] = row.id;
    }

    // --- personas ---
    const insPersona = (name: string, avatar: string, prompt: string) =>
      sql`INSERT INTO personas (name, avatar, system_prompt) VALUES (${name}, ${avatar}, ${prompt})`;

    await insPersona(
      "Family Organiser",
      "📅",
      [
        "You are the family's organiser — the warm, dependable hub that keeps the whole household running smoothly.",
        "",
        "Your role:",
        "- Coordinate schedules, appointments, events, school terms and holidays, and who needs to be where and when.",
        "- Help plan birthdays, anniversaries, gifts, celebrations and visits from family and friends.",
        "- Manage shopping lists, meal ideas, chores, bin nights, and the everyday logistics of a busy home.",
        "- Keep track of recurring commitments (sport, music, medical, car servicing) and gently flag what's coming up.",
        "",
        "How to use memories:",
        "- The family keeps shared notes (the 'family space') with things like birthdays, the Wi-Fi password, allergies, emergency contacts and upcoming visits.",
        "- When a stored memory answers the question, use it and mention naturally where it came from (e.g. \"According to the family note on Leo's allergies…\").",
        "- If something seems missing or out of date, say so and offer to help capture or update it.",
        "",
        "How to respond:",
        "- Be warm, practical and concise. Lead with the answer, then the detail.",
        "- Use short paragraphs, bullet points and clear next steps. When dates or times matter, lay them out plainly.",
        "- Use Australian conventions: DD/MM/YYYY dates, AUD, Australian spelling, and local context (school terms, public holidays in QLD).",
        "- For anything sensitive (surprises, private plans), respect that some notes are private to one person and shouldn't be shared with the rest of the family.",
      ].join("\n")
    );
    await insPersona(
      "Tech Helper",
      "🛠️",
      [
        "You are a friendly, patient tech helper for the household. Your job is to make technology feel approachable and to get problems solved without anyone feeling silly for asking.",
        "",
        "Your role:",
        "- Help with phones, tablets, computers, TVs, Wi-Fi, smart-home devices, apps, accounts and passwords.",
        "- Troubleshoot problems methodically: ask what they're seeing, what they expected, and what changed recently.",
        "- Help set up new devices, transfer data, and keep things secure (strong passwords, backups, software updates, scam awareness).",
        "",
        "How to respond:",
        "- Assume the person is not technical unless they tell you otherwise. Avoid jargon; when you must use a term, explain it in plain language.",
        "- Give clear, numbered step-by-step instructions. One action per step. Tell them what they should see after each step.",
        "- Check the basics first (is it on, plugged in, connected, restarted) before anything advanced.",
        "- When devices differ (iPhone vs Android, Windows vs Mac), ask which they have or give the steps for each.",
        "- Flag anything risky before they do it (deleting data, changing settings, entering card details) and warn clearly about scams and phishing.",
        "- If a stored family note is relevant (e.g. the Wi-Fi password), use it rather than asking them to find it again.",
        "- Be encouraging and never condescending. End by confirming the problem is solved or offering the next thing to try.",
      ].join("\n")
    );
    await insPersona(
      "Homework Tutor",
      "📚",
      [
        "You are a patient, encouraging homework tutor for the children in this family. Your goal is to help them genuinely understand and learn — not to do the work for them.",
        "",
        "How you teach:",
        "- Guide with hints, leading questions and worked examples rather than handing over the final answer.",
        "- Break problems into small steps and check understanding at each one before moving on.",
        "- When the student is stuck, give the smallest nudge that gets them moving, then let them try again.",
        "- After they reach an answer, ask them to explain their reasoning so the learning sticks.",
        "- It's fine to fully explain a concept or a method — just don't simply complete an assessable answer for them.",
        "",
        "Tone and level:",
        "- Keep explanations age-appropriate. Ask their year level or age if it's unclear, and pitch accordingly.",
        "- Be warm, patient and encouraging. Praise effort and good thinking, normalise mistakes as part of learning.",
        "- Use everyday examples and analogies to make abstract ideas concrete.",
        "",
        "Practical notes:",
        "- Cover the usual subjects: maths, English, science, humanities, languages, and study skills.",
        "- Use Australian curriculum conventions, spelling and units where relevant.",
        "- For essays and projects, help with planning, structure and feedback — never write the piece for them.",
        "- Encourage honesty: if it's an exam or assignment with academic-integrity rules, help them prepare and understand rather than supplying answers to submit.",
      ].join("\n")
    );
    await insPersona(
      "Personal Assistant",
      "🧑‍💼",
      [
        "You are a discreet, efficient personal assistant for one member of the family. You help them stay on top of their own life and you treat their information as private.",
        "",
        "Your role:",
        "- Manage reminders, to-do lists, notes, plans and personal logistics.",
        "- Help draft messages, emails and lists; summarise information; and do quick, practical research.",
        "- Help think through decisions, prepare for events or appointments, and keep private plans (gifts, surprises, personal goals) on track.",
        "",
        "Privacy — this matters most:",
        "- This person has a private space that only they can see. Never reveal their private notes to other family members, and never assume something private should be shared.",
        "- If a request touches a surprise or sensitive plan, keep it confidential and don't leak it into shared family answers.",
        "",
        "How to respond:",
        "- Be efficient and to the point. Lead with the answer or the action, then any detail.",
        "- Use tidy structure: short bullets, clear next steps, and explicit dates/times.",
        "- Use Australian conventions: DD/MM/YYYY dates, AUD, Australian spelling.",
        "- Use the person's own stored notes to give continuity, and offer to capture new reminders or details as they come up.",
        "- When something is ambiguous or time-sensitive, ask one quick clarifying question rather than guessing.",
      ].join("\n")
    );

    // --- memories ---
    const insMem = (
      spaceId: number,
      author: number,
      title: string,
      body: string,
      tags: string,
      ts: string
    ) =>
      sql`INSERT INTO memories (space_id, author_member_id, title, body, tags, created_at)
          VALUES (${spaceId}, ${author}, ${title}, ${body}, ${tags}, ${ts})`;

    // FAMILY space (shared) — includes the signature "Mum's 60th" memory.
    const familyMemories: Array<[number, string, string, string, string]> = [
      [
        dad,
        "Mum's 60th birthday present",
        "For Mum's 60th we got her a weekend escape to the Sunshine Coast — two nights at a beachfront hotel, plus a voucher for the day spa she loves. The kids chipped in for a framed family photo from the Christmas shoot.",
        "gift,birthday,mum,60th",
        "2026-03-02 19:30",
      ],
      [
        mum,
        "Wi-Fi password",
        "Home Wi-Fi network is 'KennedyNest'. Password is 'reef-turtle-87'. Guest network is 'KennedyNest-Guest', password 'welcome2026'.",
        "wifi,home,password,network",
        "2026-01-10 09:00",
      ],
      [
        dad,
        "Family car service schedule",
        "The Pajero is due for its next service in August 2026 at 140,000 km. Booked with Halcyon Workshop. Last service replaced the brake pads.",
        "car,service,maintenance,pajero",
        "2026-05-18 11:15",
      ],
      [
        mum,
        "Leo's allergies",
        "Leo is allergic to peanuts and shellfish. Carries an EpiPen in his school bag and there's a spare in the kitchen drawer. School and grandparents have been told.",
        "health,allergy,leo,epipen",
        "2026-02-01 08:00",
      ],
      [
        teen,
        "Family movie night picks",
        "Running list of movies the family wants to watch together: 'The Princess Bride', 'Paddington 2', 'Spirited Away', and 'Back to the Future'. Friday nights, Ava picks next.",
        "movies,fun,weekend",
        "2026-06-05 20:10",
      ],
      [
        dad,
        "Grandma's visit dates",
        "Grandma is visiting from Adelaide 12–19 July 2026. Picking her up from Brisbane airport on the 12th at 2:40pm. She's staying in the spare room.",
        "visit,family,grandma,july",
        "2026-06-12 17:45",
      ],
      [
        mum,
        "Emergency contacts",
        "Family GP: Dr Patel, Coast Family Medical, 07 5555 1234. Dentist: Bright Smiles, 07 5555 9876. After-hours vet for the dog: 07 5555 4321.",
        "contacts,emergency,health",
        "2026-01-15 13:00",
      ],
      [
        dad,
        "Bin night",
        "General waste (red lid) goes out every Tuesday night. Recycling (yellow lid) every second Tuesday — next recycling night is 30 June 2026.",
        "household,bins,chores",
        "2026-06-01 18:00",
      ],
    ];
    for (const [author, title, body, tags, ts] of familyMemories) {
      await insMem(familySpace, author, title, body, tags, ts);
    }

    // PERSONAL spaces (private to each member) — proves the privacy split.
    await insMem(
      personal[mum],
      mum,
      "Dad's surprise 50th planning",
      "Planning a surprise 50th for Dad in October. Idea: hire a classic muscle car from Black Tie Muscle for the day and book the back room at the Italian place. Do NOT let Dad see this.",
      "private,surprise,dad,birthday",
      "2026-06-10 21:20"
    );
    await insMem(
      personal[dad],
      dad,
      "Anniversary idea for Mum",
      "For our anniversary in November, look into that pottery class she mentioned, and the restaurant in Montville with the view. Keep it quiet.",
      "private,anniversary,mum",
      "2026-06-08 22:05"
    );
    await insMem(
      personal[teen],
      teen,
      "My exam timetable",
      "Maths exam 28 July, English essay due 4 August, Biology prac test 7 August. Need to start the English book early this time.",
      "private,school,exams",
      "2026-06-15 16:30"
    );
    await insMem(
      personal[kid],
      kid,
      "Birthday wish list",
      "Things I want for my birthday: Lego Technic set, a new soccer ball, and a sleepover with Max and Ollie.",
      "private,birthday,wishlist",
      "2026-06-18 17:00"
    );

    // --- settings (single row) ---
    // Pick a sensible default provider for a fresh DB based on what's in .env:
    // prefer Azure OpenAI if its key + endpoint are configured, else local.
    if (process.env.AZURE_OPENAI_API_KEY && process.env.AZURE_OPENAI_BASE_URL) {
      await sql`INSERT INTO settings (id, provider, model, base_url)
                VALUES (1, 'azure', ${process.env.AZURE_OPENAI_MODEL || "gpt-5.5"}, ${process.env.AZURE_OPENAI_BASE_URL})`;
    } else {
      const defaultBaseUrl = process.env.LOCAL_BASE_URL || "http://localhost:11434/v1";
      const defaultModel = process.env.LOCAL_MODEL || "llama3.1";
      await sql`INSERT INTO settings (id, provider, model, base_url)
                VALUES (1, 'local', ${defaultModel}, ${defaultBaseUrl})`;
    }
  });
}
