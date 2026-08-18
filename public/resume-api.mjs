export function createResumeApi({ readResponse, fetchImpl = fetch }) {
  const json = async (path, options = {}) => readResponse(await fetchImpl(path, options));
  const jsonBody = (method, body) => ({
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  return {
    listTemplates: () => json("/api/templates", { cache: "no-store" }),
    listResumes: (limit = 20) => json(`/api/resumes?limit=${encodeURIComponent(limit)}`, { cache: "no-store" }),
    getResume: (id) => json(`/api/resumes/${encodeURIComponent(id)}`, { cache: "no-store" }),
    getResumeVersions: (id) => json(`/api/resumes/${encodeURIComponent(id)}/versions`, { cache: "no-store" }),
    createResume: (payload) => json("/api/resumes", jsonBody("POST", payload)),
    updateResume: (id, payload) => json(`/api/resumes/${encodeURIComponent(id)}`, jsonBody("PATCH", payload)),
    async deleteResume(id) {
      const response = await fetchImpl(`/api/resumes/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!response.ok) await readResponse(response);
    }
  };
}
