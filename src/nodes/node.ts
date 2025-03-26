import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import { BASE_NODE_PORT } from "../config";
import { Value } from "../types";

export async function node(
  nodeId: number,
  N: number, // Nombre total de nœuds
  F: number, // Nombre de nœuds défaillants tolérés
  initialValue: Value, // Valeur initiale du nœud
  isFaulty: boolean, // Le nœud est-il défaillant ?
  nodesAreReady: () => boolean, // Vérifie si tous les nœuds sont prêts
  setNodeIsReady: (index: number) => void // Marque ce nœud comme prêt
) {
  const node = express();
  node.use(express.json());
  node.use(bodyParser.json());

  /** ==========================
   * 📌 1. Gestion de l'état du nœud
   * ========================== */
  type NodeState = {
    killed: boolean;
    x: Value | null;
    decided: boolean | null;
    k: number | null;
  };

  let state: NodeState = {
    killed: false,
    x: isFaulty ? null : initialValue,
    decided: isFaulty ? null : false,
    k: isFaulty ? null : 0,
  };

  /** ==========================
   * 📌 2. Routes API REST
   * ========================== */

  // 🔹 Vérifier l'état du nœud
  node.get("/status", (req, res) => {
    return isFaulty ? res.status(500).send("faulty") : res.status(200).send("live");
  });

  // 🔹 Obtenir l'état du nœud
  node.get("/getState", (req, res) => {
    res.status(200).json(state);
  });

  // 🔹 Démarrer l'algorithme Ben-Or
  node.get("/start", async (req, res) => {
    if (isFaulty || state.killed) {
      return res.status(500).send("Node is faulty or stopped");
    }
    if (!nodesAreReady()) {
      return res.status(400).send("Nodes are not ready yet");
    }

    state.k = 1;
    // Démarrer l'algorithme sans attendre qu'il se termine
    executeBenOrAlgorithm();
    return res.status(200).send("Consensus started");
  });

  // 🔹 Arrêter le nœud
  node.get("/stop", async (req, res) => {
    state.killed = true;
    return res.status(200).send("Node stopped");
  });

  // 🔹 Recevoir un message
  node.post("/message", (req, res) => {
    if (state.killed || isFaulty) {
      return res.status(500).send("Node stopped or faulty");
    }

    const message = req.body;
    handleIncomingMessage(message);
    return res.status(200).send("Message received");
  });

  /** ==========================
   * 📌 3. Algorithme de consensus Ben-Or
   * ========================== */
  type Message = {
    sender: number;
    round: number;
    value: Value;
    phase: "PROPOSE" | "VOTE";
  };

  let receivedMessages: Message[] = [];

  async function executeBenOrAlgorithm() {
    let maxIterations = 50;
    
    while (!state.decided && !state.killed && maxIterations > 0) {
      maxIterations--;
      
      console.log(`🟢 Node ${nodeId} - Round ${state.k} - Current value:`, state.x);
      
      // Phase 1: Proposition
      await broadcastMessage(state.x!, "PROPOSE");
      
      // Attendre les propositions des autres nœuds
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Compter les propositions reçues
      const proposalsForThisRound = receivedMessages.filter(
        msg => msg.round === state.k && msg.phase === "PROPOSE"
      );
      
      let voteValue: Value | null = null;
      
      const count0 = proposalsForThisRound.filter(m => m.value === 0).length;
      const count1 = proposalsForThisRound.filter(m => m.value === 1).length;
      
      // Si nous avons une majorité claire, utiliser cette valeur
      if (count0 >= Math.floor((N - F) / 2) + 1) {
        voteValue = 0;
      } else if (count1 >= Math.floor((N - F) / 2) + 1) {
        voteValue = 1;
      } else {
        voteValue = state.x !== null ? state.x : commonCoinToss(state.k!, nodeId);
      }
      
      // Phase 2: Vote
      await broadcastMessage(voteValue, "VOTE");
      
      // Attendre les votes des autres nœuds
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Compter les votes reçus
      const votesForThisRound = receivedMessages.filter(
        msg => msg.round === state.k && msg.phase === "VOTE"
      );
      
      const votes0 = votesForThisRound.filter(m => m.value === 0).length;
      const votes1 = votesForThisRound.filter(m => m.value === 1).length;
      
      // 1. Vérifier l'unanimité
      if (votes0 === N) {
        state.x = 0;
        state.decided = true;
        console.log(`✅ Node ${nodeId} reached unanimous consensus on 0`);
        break;
      } else if (votes1 === N) {
        state.x = 1;
        state.decided = true;
        console.log(`✅ Node ${nodeId} reached unanimous consensus on 1`);
        break;
      }
      
      // 2. Vérifier la majorité simple (au lieu d'unanimité)
      const majorityThreshold = Math.floor(N / 2) + 1;
      if (votes0 >= majorityThreshold) {
        state.x = 0;
        state.decided = true;
        console.log(`✅ Node ${nodeId} reached simple majority consensus on 0`);
        break;
      } else if (votes1 >= majorityThreshold) {
        state.x = 1;
        state.decided = true;
        console.log(`✅ Node ${nodeId} reached simple majority consensus on 1`);
        break;
      }
      
      // Si pas de majorité simple, utiliser le tirage au sort
      state.x = commonCoinToss(state.k!, nodeId);
      
      // Nettoyer les messages des rounds précédents
      receivedMessages = receivedMessages.filter(msg => msg.round >= state.k!);
      
      // Incrémenter le round
      state.k! += 1;
      
      // Pause légère pour éviter la surcharge CPU
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    // Si après maxIterations, nous n'avons toujours pas décidé mais que nous dépassons le seuil de tolérance aux fautes
    if (!state.decided && N - F <= F) {
      console.log(`⚠️ Node ${nodeId} exceeded fault tolerance threshold without consensus`);
    }
  }

  /** ==========================
   * 📌 4. Communication entre nœuds
   * ========================== */

  // 🔹 Envoi de la valeur aux autres nœuds
  async function broadcastMessage(value: Value, phase: "PROPOSE" | "VOTE") {
    // Ajouter notre propre message à la liste des messages reçus
    handleIncomingMessage({
      sender: nodeId,
      round: state.k!,
      value,
      phase
    });

    // Envoyer aux autres nœuds
    const promises = [];
    for (let i = 0; i < N; i++) {
      if (i !== nodeId) {
        promises.push(
          fetch(`http://localhost:${BASE_NODE_PORT + i}/message`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sender: nodeId,
              round: state.k,
              value,
              phase
            }),
          }).catch(() => {
            // Ignorer les erreurs de connexion, cela peut être un nœud défaillant
          })
        );
      }
    }
    
    // Attendre que tous les messages soient envoyés, mais avec un timeout
    await Promise.all(promises);
  }

  // 🔹 Traitement des messages entrants
  function handleIncomingMessage(message: Message) {
    if (!isFaulty && !state.killed) {
      if (message && message.round !== undefined && message.value !== undefined && message.phase) {
        receivedMessages.push(message);
      }
    }
  }

  // 🔹 Fonction de tirage au sort partagé
  function commonCoinToss(k: number, nodeId: number): Value {
    return ((k + nodeId) % 2) as Value;
  }

  /** ==========================
   * 📌 5. Démarrage du serveur
   * ========================== */
  const server = node.listen(BASE_NODE_PORT + nodeId, async () => {
    console.log(`🚀 Node ${nodeId} is listening on port ${BASE_NODE_PORT + nodeId}`);
    setNodeIsReady(nodeId);
  });

  return server;
}
