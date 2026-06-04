const statusDot = document.querySelector("#status-dot");
const statusText = document.querySelector("#status-text");
const form = document.querySelector("#generate-form");
const questionsContainer = document.querySelector("#questions");
const metadataContainer = document.querySelector("#metadata");
const errorBox = document.querySelector("#error-box");
const historyButton = document.querySelector("#history-button");
const historyContainer = document.querySelector("#history");

async function checkHealth() {
  try {
    const response = await fetch("/health");
    const body = await response.json();

    if (!response.ok) {
      throw new Error(body.message ?? "Health check failed");
    }

    statusDot.classList.add("ok");
    statusText.textContent = `${body.service} is online`;
  } catch (error) {
    statusDot.classList.add("error");
    statusText.textContent = "API unavailable";
  }
}

function showError(message) {
  errorBox.textContent = message;
  errorBox.classList.remove("hidden");
}

function clearError() {
  errorBox.textContent = "";
  errorBox.classList.add("hidden");
}

function renderMetadata(metadata) {
  metadataContainer.innerHTML = "";

  const entries = [
    ["mode", metadata.mode],
    ["cache", metadata.cache],
    ["level", metadata.academicLevel],
    ["questions", metadata.questionCount]
  ];

  for (const [label, value] of entries) {
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = `${label}: ${value}`;
    metadataContainer.appendChild(badge);
  }
}

function renderQuestions(questions) {
  questionsContainer.classList.remove("empty-state");
  questionsContainer.innerHTML = "";

  for (const question of questions) {
    const card = document.createElement("article");
    card.className = "question-card";

    const title = document.createElement("h3");
    title.textContent = `Question ${question.id}`;

    const questionText = document.createElement("p");
    questionText.textContent = question.question;

    const answer = document.createElement("p");
    answer.innerHTML = `<strong>Answer:</strong> ${question.answer}`;

    const marks = document.createElement("span");
    marks.className = "badge";
    marks.textContent = `${question.marks} marks`;

    const markScheme = document.createElement("ul");
    markScheme.className = "mark-scheme";

    for (const point of question.markScheme) {
      const item = document.createElement("li");
      item.textContent = point;
      markScheme.appendChild(item);
    }

    card.append(title, questionText, answer, marks, markScheme);
    questionsContainer.appendChild(card);
  }
}

async function generateWorksheet(event) {
  event.preventDefault();
  clearError();

  const formData = new FormData(form);

  const requestBody = {
    subject: String(formData.get("subject")),
    topic: String(formData.get("topic")),
    difficulty: String(formData.get("difficulty")),
    questionCount: Number(formData.get("questionCount")),
    format: String(formData.get("format"))
  };

  questionsContainer.classList.add("empty-state");
  questionsContainer.textContent = "Generating worksheet...";
  metadataContainer.innerHTML = "";

  try {
    const response = await fetch("/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody)
    });

    const body = await response.json();

    if (!response.ok) {
      throw new Error(body.message ?? "Failed to generate worksheet");
    }

    renderMetadata(body.metadata);
    renderQuestions(body.questions);
  } catch (error) {
    questionsContainer.textContent = "No worksheet generated.";
    showError(error instanceof Error ? error.message : "Something went wrong.");
  }
}

async function loadHistory() {
  historyContainer.classList.add("empty-state");
  historyContainer.textContent = "Loading history...";

  try {
    const response = await fetch("/history");
    const body = await response.json();

    if (!response.ok) {
      throw new Error(body.message ?? "Failed to load history");
    }

    if (body.worksheets.length === 0) {
      historyContainer.textContent = "No worksheet history found yet.";
      return;
    }

    historyContainer.classList.remove("empty-state");
    historyContainer.innerHTML = "";

    for (const worksheet of body.worksheets) {
      const card = document.createElement("article");
      card.className = "history-card";

      const title = document.createElement("h3");
      title.textContent = worksheet.topic;

      const details = document.createElement("p");
      details.textContent = `${worksheet.subject} · ${worksheet.difficulty} · ${worksheet.question_count} questions`;

      const badges = document.createElement("div");
      badges.className = "metadata";

      for (const [label, value] of [
        ["mode", worksheet.mode],
        ["cache", worksheet.cache_status],
        ["created", worksheet.created_at]
      ]) {
        const badge = document.createElement("span");
        badge.className = "badge";
        badge.textContent = `${label}: ${value}`;
        badges.appendChild(badge);
      }

      card.append(title, details, badges);
      historyContainer.appendChild(card);
    }
  } catch (error) {
    historyContainer.textContent = "Could not load history.";
  }
}

form.addEventListener("submit", generateWorksheet);
historyButton.addEventListener("click", loadHistory);

checkHealth();