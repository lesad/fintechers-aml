package cz.morosystems.aml.engine.summary

/** One model sentence and the activity refs it rests on: the claim every AI body is made of (ADR-0043). */
data class Sentence(val text: String, val refs: List<String>)
