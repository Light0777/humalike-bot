-- Enable RLS on all tables
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE memories ENABLE ROW LEVEL SECURITY;

-- Rooms: anyone can create, read, update
CREATE POLICY "public_create_rooms"
  ON rooms FOR INSERT
  WITH CHECK (true);

CREATE POLICY "public_read_rooms"
  ON rooms FOR SELECT
  USING (true);

CREATE POLICY "public_update_rooms"
  ON rooms FOR UPDATE
  USING (true);

-- Participants: anyone can CRUD
CREATE POLICY "public_create_participants"
  ON participants FOR INSERT
  WITH CHECK (true);

CREATE POLICY "public_read_participants"
  ON participants FOR SELECT
  USING (true);

CREATE POLICY "public_update_participants"
  ON participants FOR UPDATE
  USING (true);

CREATE POLICY "public_delete_participants"
  ON participants FOR DELETE
  USING (true);

-- Conversations: anyone can CRUD
CREATE POLICY "public_create_conversations"
  ON conversations FOR INSERT
  WITH CHECK (true);

CREATE POLICY "public_read_conversations"
  ON conversations FOR SELECT
  USING (true);

-- Relationships: anyone can CRUD
CREATE POLICY "public_create_relationships"
  ON relationships FOR INSERT
  WITH CHECK (true);

CREATE POLICY "public_read_relationships"
  ON relationships FOR SELECT
  USING (true);

CREATE POLICY "public_update_relationships"
  ON relationships FOR UPDATE
  USING (true);

-- Memories: anyone can CRUD
CREATE POLICY "public_create_memories"
  ON memories FOR INSERT
  WITH CHECK (true);

CREATE POLICY "public_read_memories"
  ON memories FOR SELECT
  USING (true);
