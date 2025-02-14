export default defineEventHandler(async (event) => {
    // Get query parameters (if any)
    const query = getQuery(event);
    const body = await readBody(event);  // Read request body (if POST request)
    const auth = getHeader(event, "Authorization");  // Extract Authorization header
  
    // Forward the request to KliveAPI
    const response = await fetch(`https://klive.dev${query?.path || ""}`, {
      method: event.method,
      headers: {
        "Authorization": auth || "",
        "Content-Type": "application/json"
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  
    // Return the response as JSON
    return response.json();
  });