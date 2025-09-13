# Répertoire des sources Java
SRC_DIR=src
BIN_DIR=bin
LIB_DIR=lib

# Classpath pour libs + bin
CLASSPATH=$(LIB_DIR)/*:$(BIN_DIR)

# Commandes Java
JAVAC=javac
JAVA=java

# Fichiers de sortie
RESULTS=resultats.txt
INDEX=index.txt

# === Targets ===

all: $(INDEX)

# Étape 1 : Extraction des noms depuis les PDFs
$(RESULTS): $(SRC_DIR)/PDFExtractor.java
	@echo "🔧 Compilation PDFExtractor.java..."
	$(JAVAC) -cp "$(LIB_DIR)/*" -d $(BIN_DIR) $(SRC_DIR)/PDFExtractor.java
	@echo "▶️ Exécution : extraction des noms → $(RESULTS)"
	$(JAVA) -cp "$(CLASSPATH)" PDFExtractor

# Étape 2 : Génération de l'index
$(INDEX): $(RESULTS) $(SRC_DIR)/IndexBuilder.java
	@echo "🔧 Compilation IndexBuilder.java..."
	$(JAVAC) -cp "$(LIB_DIR)/*" -d $(BIN_DIR) $(SRC_DIR)/IndexBuilder.java
	@echo "▶️ Exécution : génération de l'index → $(INDEX)"
	$(JAVA) -cp "$(CLASSPATH)" IndexBuilder

clean:
	@echo "🧹 Suppression des fichiers générés..."
	rm -f $(RESULTS) $(INDEX)
	rm -rf $(BIN_DIR)/*

