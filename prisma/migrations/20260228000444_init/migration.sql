-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "context" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'setup',

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectQuestion" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT,

    CONSTRAINT "ProjectQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cohort" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "attentionWeights" JSONB NOT NULL,
    "sensitivityTags" JSONB NOT NULL,

    CONSTRAINT "Cohort_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimelineEvent" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "dayNumber" INTEGER NOT NULL,
    "dateLabel" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "TimelineEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tick" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "tickNumber" INTEGER NOT NULL,
    "dateLabel" TEXT NOT NULL,

    CONSTRAINT "Tick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "tickId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "parentId" TEXT,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CohortSummary" (
    "id" TEXT NOT NULL,
    "tickId" TEXT NOT NULL,
    "cohortId" TEXT NOT NULL,
    "mood" TEXT NOT NULL,
    "dominantNarrative" TEXT NOT NULL,
    "behaviours" JSONB NOT NULL,

    CONSTRAINT "CohortSummary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectQuestion_projectId_idx" ON "ProjectQuestion"("projectId");

-- CreateIndex
CREATE INDEX "Cohort_projectId_idx" ON "Cohort"("projectId");

-- CreateIndex
CREATE INDEX "TimelineEvent_projectId_idx" ON "TimelineEvent"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "TimelineEvent_projectId_dayNumber_key" ON "TimelineEvent"("projectId", "dayNumber");

-- CreateIndex
CREATE INDEX "Tick_projectId_idx" ON "Tick"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Tick_projectId_tickNumber_key" ON "Tick"("projectId", "tickNumber");

-- CreateIndex
CREATE INDEX "Message_tickId_idx" ON "Message"("tickId");

-- CreateIndex
CREATE INDEX "CohortSummary_tickId_idx" ON "CohortSummary"("tickId");

-- CreateIndex
CREATE UNIQUE INDEX "CohortSummary_tickId_cohortId_key" ON "CohortSummary"("tickId", "cohortId");

-- AddForeignKey
ALTER TABLE "ProjectQuestion" ADD CONSTRAINT "ProjectQuestion_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cohort" ADD CONSTRAINT "Cohort_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimelineEvent" ADD CONSTRAINT "TimelineEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tick" ADD CONSTRAINT "Tick_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_tickId_fkey" FOREIGN KEY ("tickId") REFERENCES "Tick"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CohortSummary" ADD CONSTRAINT "CohortSummary_tickId_fkey" FOREIGN KEY ("tickId") REFERENCES "Tick"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CohortSummary" ADD CONSTRAINT "CohortSummary_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "Cohort"("id") ON DELETE CASCADE ON UPDATE CASCADE;
