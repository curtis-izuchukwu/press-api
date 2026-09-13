const form = document.querySelector("#generate-form");
const generateButton = document.querySelector("#generate-button");
const generateButtonLabel = document.querySelector("#generate-button-label");
const formStatus = document.querySelector("#form-status");
const requestState = document.querySelector("#request-state");
const questionsContainer = document.querySelector("#questions");
const metadataContainer = document.querySelector("#metadata");
const errorBox = document.querySelector("#error-box");

const requestPreview = document.querySelector("#request-preview");
const responsePreview = document.querySelector("#response-preview");
const responseMeta = document.querySelector("#response-meta");
const responsePlaceholder = document.querySelector("#response-placeholder");
const responseDetails = document.querySelector("#response-details");
const exchangeState = document.querySelector("#exchange-state");
const copyRequestButton = document.querySelector("#copy-request");
const copyResponseButton = document.querySelector("#copy-response");

const statusDot = document.querySelector("#status-dot");
const statusText = document.querySelector("#status-text");
const statusDetail = document.querySelector("#status-detail");
const versionText = document.querySelector("#version-text");
const checkedText = document.querySelector("#checked-text");
const latencyText = document.querySelector("#latency-text");
const refreshStatusButton = document.querySelector("#refresh-status");

const endpointValue = document.querySelector("#endpoint-value");
const copyEndpointButton = document.querySelector("#copy-endpoint");
const copyCurlButton = document.querySelector("#copy-curl");
const historyButton = document.querySelector("#history-button");
const historyContainer = document.querySelector("#history");

const subjectInput = document.querySelector("#subject");
const topicInput = document.querySelector("#topic");
const questionCountInput = document.querySelector("#questionCount");
const difficultyInput = document.querySelector("#difficulty");
const formatInput = document.querySelector("#format");

const copyTimers = new WeakMap();
let latestResponseText = "";
let generateLabelTimer;

function getCurrentRequestBody() {
  return {
    subject: subjectInput.value.trim(),
    topic: topicInput.value.trim(),
    difficulty: difficultyInput.value,
    questionCount: Number(questionCountInput.value),
    format: formatInput.value
  };
}

function formatJson(value) {
  return JSON.stringify(value, null, 2);
}

function updateRequestPreview(requestBody = getCurrentRequestBody()) {
  requestPreview.textContent = formatJson(requestBody);
}

function setState(element, label, state) {
  element.textContent = label;

  if (state) {
    element.dataset.state = state;
  } else {
    delete element.dataset.state;
  }
}

function setFormStatus(message, state) {
  formStatus.textContent = message;

  if (state) {
    formStatus.dataset.state = state;
  } else {
    delete formStatus.dataset.state;
  }
}

function setGenerateLoading(isLoading) {
  generateButton.disabled = isLoading;
  generateButton.classList.toggle("is-loading", isLoading);
  form.toggleAttribute("aria-busy", isLoading);

  for (const control of form.querySelectorAll("input, select")) {
    control.disabled = isLoading;
  }

  if (isLoading) {
    window.clearTimeout(generateLabelTimer);
    generateButtonLabel.textContent = "Generating…";
  }
}

function showGeneratedButtonState() {
  generateButtonLabel.textContent = "Generated";
  window.clearTimeout(generateLabelTimer);
  generateLabelTimer = window.setTimeout(() => {
    if (!generateButton.disabled) {
      generateButtonLabel.textContent = "Generate worksheet";
    }
  }, 1400);
}

function showError(message) {
  errorBox.textContent = message;
  errorBox.classList.remove("hidden");
}

function clearError() {
  errorBox.textContent = "";
  errorBox.classList.add("hidden");
}

function validateField(field) {
  const error = document.querySelector(`#${field.id}-error`);
  let message = "";

  if ((field === subjectInput || field === topicInput) && !field.value.trim()) {
    message = `${field === subjectInput ? "Subject" : "Topic"} is required.`;
  }

  if (field === questionCountInput) {
    const count = field.valueAsNumber;

    if (!field.value) {
      message = "Question count is required.";
    } else if (!Number.isInteger(count) || count < 1 || count > 10) {
      message = "Use a whole number from 1 to 10.";
    }
  }

  field.setAttribute("aria-invalid", String(Boolean(message)));

  if (error) {
    error.textContent = message;
  }

  return !message;
}

function validateForm() {
  const fields = [subjectInput, topicInput, questionCountInput];
  const invalidFields = fields.filter((field) => !validateField(field));

  if (invalidFields.length > 0) {
    invalidFields[0].focus();
    setFormStatus("Check the highlighted fields before sending.", "error");
    setState(requestState, "Invalid", "error");
    return false;
  }

  return true;
}

async function writeClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const temporaryInput = document.createElement("textarea");
  temporaryInput.value = text;
  temporaryInput.setAttribute("readonly", "");
  temporaryInput.style.position = "fixed";
  temporaryInput.style.opacity = "0";
  document.body.appendChild(temporaryInput);
  temporaryInput.select();
  const copied = document.execCommand("copy");
  temporaryInput.remove();

  if (!copied) {
    throw new Error("Clipboard unavailable");
  }
}

async function copyText(button, text, successLabel, defaultLabel) {
  const currentTimer = copyTimers.get(button);
  window.clearTimeout(currentTimer);

  try {
    await writeClipboard(text);
    button.textContent = successLabel;
  } catch {
    button.textContent = "Copy failed";
  }

  const timer = window.setTimeout(() => {
    button.textContent = defaultLabel;
  }, 1500);

  copyTimers.set(button, timer);
}

async function readResponse(response) {
  const rawText = await response.text();

  if (!rawText) {
    return null;
  }

  try {
    return JSON.parse(rawText);
  } catch {
    return { raw: rawText };
  }
}

function responseStatusText(response) {
  if (response.statusText) {
    return response.statusText;
  }

  if (response.status >= 200 && response.status < 300) {
    return "OK";
  }

  return "Error";
}

function beginExchange(requestBody) {
  updateRequestPreview(requestBody);
  latestResponseText = "";
  copyResponseButton.disabled = true;
  responsePreview.textContent = "";
  responseDetails.classList.add("hidden");
  responsePlaceholder.classList.remove("hidden");
  responsePlaceholder.dataset.state = "loading";
  responsePlaceholder.textContent = "POST /generate in progress…";
  responseMeta.textContent = "Request in progress";
  setState(exchangeState, "Sending", "loading");
}

function renderExchangeResponse(response, body, elapsed) {
  latestResponseText = formatJson(body);
  responsePreview.textContent = latestResponseText;
  responseMeta.textContent =
    `${response.status} ${responseStatusText(response)} · ${elapsed}ms`;
  responsePlaceholder.classList.add("hidden");
  delete responsePlaceholder.dataset.state;
  responseDetails.classList.remove("hidden");
  responseDetails.open = true;
  copyResponseButton.disabled = false;
  setState(
    exchangeState,
    response.ok ? "Received" : "Error",
    response.ok ? "success" : "error"
  );
}

function renderNetworkError(error, elapsed) {
  const message = error instanceof Error ? error.message : "Request failed";
  const body = {
    error: "Network error",
    message
  };

  latestResponseText = formatJson(body);
  responsePreview.textContent = latestResponseText;
  responseMeta.textContent = `Network error · ${elapsed}ms`;
  responsePlaceholder.classList.add("hidden");
  delete responsePlaceholder.dataset.state;
  responseDetails.classList.remove("hidden");
  responseDetails.open = true;
  copyResponseButton.disabled = false;
  setState(exchangeState, "Error", "error");
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
    if (value === undefined || value === null) {
      continue;
    }

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
    const answerLabel = document.createElement("strong");
    answerLabel.textContent = "Answer: ";
    answer.append(answerLabel, document.createTextNode(question.answer));

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

  if (!validateForm()) {
    return;
  }

  const requestBody = getCurrentRequestBody();
  const startedAt = performance.now();
  let exchangeHasResponse = false;

  setGenerateLoading(true);
  setState(requestState, "Sending", "loading");
  setFormStatus("Sending request to /generate.");
  beginExchange(requestBody);
  questionsContainer.setAttribute("aria-busy", "true");
  questionsContainer.classList.add("empty-state");
  questionsContainer.textContent = "Generating worksheet…";
  metadataContainer.innerHTML = "";

  try {
    const response = await fetch("/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody)
    });

    const body = await readResponse(response);
    const elapsed = Math.round(performance.now() - startedAt);
    renderExchangeResponse(response, body, elapsed);
    exchangeHasResponse = true;

    if (!response.ok) {
      throw new Error(body?.message ?? "Failed to generate worksheet");
    }

    if (!body?.metadata || !Array.isArray(body.questions)) {
      throw new Error("The API returned an unexpected response.");
    }

    renderMetadata(body.metadata);
    renderQuestions(body.questions);
    setState(requestState, "Complete", "success");
    setFormStatus(
      `Response received in ${elapsed}ms · ${body.questions.length} questions.`,
      "success"
    );
    showGeneratedButtonState();
  } catch (error) {
    const elapsed = Math.round(performance.now() - startedAt);

    if (!exchangeHasResponse) {
      renderNetworkError(error, elapsed);
    }

    const message = error instanceof Error ? error.message : "Something went wrong.";
    questionsContainer.textContent = "No worksheet generated.";
    setState(requestState, "Failed", "error");
    setFormStatus("The request did not complete successfully.", "error");
    generateButtonLabel.textContent = "Generate worksheet";
    showError(message);
  } finally {
    questionsContainer.removeAttribute("aria-busy");
    setGenerateLoading(false);
  }
}

function formatCheckedTime(date) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(date);
}

async function checkHealth() {
  const startedAt = performance.now();
  refreshStatusButton.disabled = true;
  refreshStatusButton.textContent = "Checking…";
  statusDot.className = "status-dot";
  statusText.textContent = "Checking";
  statusDetail.textContent = "Contacting /health";

  try {
    const response = await fetch("/health");
    const body = await response.json();

    if (!response.ok) {
      throw new Error(body.message ?? "Health check failed");
    }

    statusDot.classList.add("ok");
    statusText.textContent = "Operational";
    statusDetail.textContent = body.service;
    versionText.textContent = body.version ? `v${body.version}` : "Unavailable";
    latencyText.textContent = `${Math.round(performance.now() - startedAt)}ms`;
  } catch {
    statusDot.classList.add("error");
    statusText.textContent = "Unavailable";
    statusDetail.textContent = "Health check failed";
    versionText.textContent = "Unavailable";
    latencyText.textContent = "Unavailable";
  } finally {
    checkedText.textContent = formatCheckedTime(new Date());
    refreshStatusButton.disabled = false;
    refreshStatusButton.textContent = "Refresh";
  }
}

async function loadHistory() {
  historyButton.disabled = true;
  historyButton.textContent = "Loading…";
  historyContainer.classList.add("empty-state");
  historyContainer.textContent = "Loading stored worksheet records…";

  try {
    const response = await fetch("/history");
    const body = await response.json();

    if (!response.ok) {
      throw new Error(body.message ?? "Failed to load history");
    }

    if (!Array.isArray(body.worksheets) || body.worksheets.length === 0) {
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
      details.textContent =
        `${worksheet.subject} / ${worksheet.difficulty} / ${worksheet.question_count} questions`;

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
  } catch {
    historyContainer.textContent = "Could not load worksheet history.";
  } finally {
    historyButton.disabled = false;
    historyButton.textContent = "Reload";
  }
}

form.addEventListener("submit", generateWorksheet);
form.addEventListener("input", (event) => {
  const field = event.target;

  if (field instanceof HTMLInputElement && field.hasAttribute("aria-invalid")) {
    validateField(field);
  }

  updateRequestPreview();
  window.clearTimeout(generateLabelTimer);
  generateButtonLabel.textContent = "Generate worksheet";
  setState(requestState, "Ready");
  setFormStatus("");
});

form.addEventListener("focusout", (event) => {
  const field = event.target;

  if (
    field === subjectInput ||
    field === topicInput ||
    field === questionCountInput
  ) {
    validateField(field);
  }
});

copyRequestButton.addEventListener("click", () =>
  copyText(copyRequestButton, requestPreview.textContent, "Copied", "Copy request")
);

copyResponseButton.addEventListener("click", () =>
  copyText(copyResponseButton, latestResponseText, "Copied", "Copy response")
);

const generateEndpoint = `${window.location.origin}/generate`;
endpointValue.textContent = generateEndpoint;
endpointValue.title = generateEndpoint;

copyEndpointButton.addEventListener("click", () =>
  copyText(
    copyEndpointButton,
    endpointValue.textContent ?? "",
    "Copied",
    "Copy URL"
  )
);

copyCurlButton.addEventListener("click", () => {
  const payload = formatJson(getCurrentRequestBody());
  const shellPayload = payload.replaceAll("'", "'\"'\"'");
  const command = `curl -X POST "${endpointValue.textContent ?? ""}" \\
  -H "Content-Type: application/json" \\
  -d '${shellPayload}'`;

  return copyText(copyCurlButton, command, "Copied", "Copy cURL");
});

historyButton.addEventListener("click", loadHistory);
refreshStatusButton.addEventListener("click", checkHealth);

updateRequestPreview();
checkHealth();
