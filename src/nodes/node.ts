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
      await broadcastMessage(voteValue
