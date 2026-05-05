#To be inserted at 802254cc
.include "Common.s"

# Store stack frame
  backup

  mr r3, sp
  li r4, 0
  li r5, 0
  branchl r12, FN_EXITransferBuffer

Exit:
#restore registers and sp
  restore

#restore code
  lis	r3, 0x804A
  subi r7, r3, 1536
  lwz	r0, -0x6C98 (r13)
