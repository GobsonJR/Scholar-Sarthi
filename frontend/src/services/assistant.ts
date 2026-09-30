import { api } from "./api";

export async function askAssistant(question: string, applicationId?: string): Promise<string> {
  const { data } = await api.post<{ answer: string }>("/assistant/ask", { question, application_id: applicationId });
  return data.answer;
}
