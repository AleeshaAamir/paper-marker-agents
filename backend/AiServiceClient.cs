using System.Net.Http.Json;
using System.Text.Json;

namespace Backend.Services;

/// <summary>
/// Thin HTTP client for the Python AI Marking microservice (ai-service/).
/// This backend owns auth/roles/business state; ai-service owns nothing
/// but the actual OCR/segmentation/marking logic. See ai-service/app.py.
/// </summary>
public class AiServiceClient(HttpClient http)
{
    public async Task<JsonElement> MarkAsync(object markRequest)
    {
        var res = await http.PostAsJsonAsync("/internal/mark", markRequest);
        res.EnsureSuccessStatusCode();
        return await res.Content.ReadFromJsonAsync<JsonElement>();
    }

    public async Task<JsonElement> SegmentAsync(string rawText, string language, string model)
    {
        var res = await http.PostAsJsonAsync("/internal/segment",
            new { raw_text = rawText, language, model });
        res.EnsureSuccessStatusCode();
        return await res.Content.ReadFromJsonAsync<JsonElement>();
    }

    public async Task<JsonElement> OcrAsync(byte[] fileBytes, string fileName, string contentType, string language)
    {
        using var form = new MultipartFormDataContent();
        var fileContent = new ByteArrayContent(fileBytes);
        fileContent.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue(contentType);
        form.Add(fileContent, "file", fileName);
        form.Add(new StringContent(language), "language");

        var res = await http.PostAsync("/internal/ocr", form);
        res.EnsureSuccessStatusCode();
        return await res.Content.ReadFromJsonAsync<JsonElement>();
    }
}
