import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.json.*;

import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Properties;

public class PDFExtractor {

    private static final String API_URL = "https://api.openai.com/v1/chat/completions";
    private static String OPENAI_API_KEY;

    // 💰 Suivi du coût total
    private static double totalCost = 0.0;
    private static int apiCallCount = 0;

    public static void main(String[] args) throws Exception {
        loadEnv();

        String folderPath = "pdfs";
        String outputPath = "resultats.txt";

        File folder = new File(folderPath);
        File[] files = folder.listFiles((dir, name) -> name.toLowerCase().endsWith(".pdf"));

        if (files == null || files.length == 0) {
            System.out.println("Aucun fichier PDF trouvé dans le dossier : " + folderPath);
            return;
        }

        FileWriter writer = new FileWriter(outputPath);

        for (File file : files) {
            String fileName = file.getName();
            String text = extractLastPageText(file);
            String numeroPlanche = getNumeroDePlanche(text);
            String noms = extractNomsDeFamilleViaChatGPT(text);

            writer.write(numeroPlanche + " (" + fileName + ") : " + noms + "\n");
            System.out.println("✔ Traité : " + fileName + " → " + numeroPlanche);
        }

        writer.close();
        System.out.println("✅ Extraction terminée. Voir resultats.txt");

        if (apiCallCount > 0) {
            System.out.printf("💰 Coût total estimé : $%.5f (%d requêtes API)\n", totalCost, apiCallCount);
        }
    }

    public static void loadEnv() throws IOException {
        File envFile = new File(".env");
        Properties props = new Properties();
        try (FileInputStream fis = new FileInputStream(envFile)) {
            props.load(fis);
            OPENAI_API_KEY = props.getProperty("OPENAI_API_KEY");
            if (OPENAI_API_KEY == null || OPENAI_API_KEY.isEmpty()) {
                throw new RuntimeException("Clé API manquante dans .env");
            }
        }
    }

    public static String extractLastPageText(File pdfFile) throws IOException {
        try (PDDocument document = PDDocument.load(pdfFile)) {
            int lastPage = document.getNumberOfPages();
            PDFTextStripper stripper = new PDFTextStripper();
            stripper.setStartPage(lastPage);
            stripper.setEndPage(lastPage);
            return stripper.getText(document);
        }
    }

    public static String getNumeroDePlanche(String text) {
        String[] lines = text.split("\n");

        for (int i = lines.length - 1; i >= 0; i--) {
            String line = lines[i].trim();
            if (line.isEmpty() || line.contains("-->")) continue;

            String[] words = line.split("\\s+");
            if (words.length == 0) continue;

            String lastWord = words[words.length - 1].trim();
            if (lastWord.matches("^[A-Z]\\d{0,3}$")) {
                return "Planche " + lastWord;
            }
        }

        return "[Planche inconnue]";
    }

    public static String extractNomsDeFamilleViaChatGPT(String texte) throws IOException {
        String prompt = "Voici un texte extrait d'une planche généalogique. " +
                "Donne uniquement la liste des noms de famille présents, séparés par des virgules.";

        String body = "{\n" +
                "  \"model\": \"gpt-3.5-turbo\",\n" +
                "  \"messages\": [\n" +
                "    {\"role\": \"system\", \"content\": \"Tu es un expert en généalogie.\"},\n" +
                "    {\"role\": \"user\", \"content\": \"" + escapeJson(prompt + "\\n\\n" + texte) + "\"}\n" +
                "  ]\n" +
                "}";

        HttpURLConnection connection = (HttpURLConnection) new URL(API_URL).openConnection();
        connection.setRequestMethod("POST");
        connection.setRequestProperty("Authorization", "Bearer " + OPENAI_API_KEY);
        connection.setRequestProperty("Content-Type", "application/json");
        connection.setDoOutput(true);

        try (OutputStream os = connection.getOutputStream()) {
            byte[] input = body.getBytes("utf-8");
            os.write(input, 0, input.length);
        }

        StringBuilder response = new StringBuilder();
        try (BufferedReader br = new BufferedReader(
                new InputStreamReader(connection.getInputStream(), "utf-8"))) {
            String line;
            while ((line = br.readLine()) != null) {
                response.append(line.trim());
            }
        } catch (IOException e) {
            System.err.println("❌ Erreur lors de la lecture de la réponse API : " + e.getMessage());
            return "[Erreur API]";
        }

        // ✅ JSON parsing avec org.json
        try {
            JSONObject json = new JSONObject(response.toString());

            // 💰 Estimation coût API
            if (json.has("usage")) {
                JSONObject usage = json.getJSONObject("usage");
                int promptTokens = usage.optInt("prompt_tokens", 0);
                int completionTokens = usage.optInt("completion_tokens", 0);
                int totalTokens = usage.optInt("total_tokens", 0);

                double cost = (promptTokens * 0.0015 + completionTokens * 0.0020) / 1000;
                totalCost += cost;
                apiCallCount++;

                System.out.printf("💰 Coût estimé : $%.5f (%d tokens total)\n", cost, totalTokens);
            }

            JSONArray choices = json.getJSONArray("choices");
            if (choices.length() > 0) {
                JSONObject message = choices.getJSONObject(0).getJSONObject("message");
                String content = message.getString("content");
                return content.trim();
            }
        } catch (JSONException je) {
            System.err.println("❌ Erreur de parsing JSON : " + je.getMessage());
            return "[Erreur API]";
        }

        return "[Erreur API]";
    }

    private static String escapeJson(String text) {
        return text.replace("\\", "\\\\")
                   .replace("\"", "\\\"")
                   .replace("\n", "\\n")
                   .replace("\r", "");
    }
}
