import java.io.*;
import java.text.Normalizer;
import java.util.*;

public class IndexBuilder {

    public static void main(String[] args) {
        String inputPath = "resultats.txt";
        String outputPath = "index.txt";

        Map<String, Set<String>> indexMap = new TreeMap<>();

        try (BufferedReader reader = new BufferedReader(new FileReader(inputPath))) {
            String line;

            while ((line = reader.readLine()) != null) {
                if (!line.contains(" : ")) continue;

                String planche = extractPlanche(line);
                if (planche == null) continue;

                String[] parts = line.split(" : ", 2);
                if (parts.length < 2) continue;

                String[] noms = parts[1].split(",");

                for (String nom : noms) {
                    String clean = normalizeNom(nom);
                    if (clean.isEmpty()) continue;

                    indexMap.computeIfAbsent(clean, k -> new TreeSet<>()).add(planche);
                }
            }

            try (BufferedWriter writer = new BufferedWriter(new FileWriter(outputPath))) {
                for (Map.Entry<String, Set<String>> entry : indexMap.entrySet()) {
                    String nom = entry.getKey();
                    String planches = String.join(", ", entry.getValue());
                    writer.write(nom + " : " + planches + "\n");
                }
            }

            System.out.println("✅ Index généré dans : " + outputPath);

        } catch (IOException e) {
            System.err.println("❌ Erreur de lecture ou d'écriture : " + e.getMessage());
        }
    }

    // Extrait "Planche C4" → "C4"
    private static String extractPlanche(String line) {
        try {
            int start = line.indexOf("Planche ");
            if (start == -1) return null;
            int end = line.indexOf(" (", start);
            if (end == -1) return null;

            return line.substring(start + 8, end).trim();
        } catch (Exception e) {
            return null;
        }
    }

    // Normalise les noms : majuscules, sans accent, fusionnés sans espace/tiret/particule
private static String normalizeNom(String nom) {
    if (nom == null) return "";

    // Trim et mise en majuscule
    nom = nom.trim().toUpperCase();

    // Supprimer les accents
    nom = Normalizer.normalize(nom, Normalizer.Form.NFD)
                   .replaceAll("[\\p{InCombiningDiacriticalMarks}]", "");

    // Supprimer les caractères non alphabétiques ou tirets ou espaces
    nom = nom.replaceAll("[^A-Z\\-\\s]", "");

    // Nettoyer les doubles espaces
    nom = nom.replaceAll("\\s{2,}", " ").trim();

    // Filtrage
    if (nom.length() <= 1 || nom.matches("^[A-Z]\\d{0,2}$")) return "";

    Set<String> blacklist = Set.of("PLAN", "PAGE", "PLANCHE", "VOIR", "SUITE", "TABLE", "NOM");
    if (blacklist.contains(nom)) return "";

    return nom;
}

}
