import { AfterUpdate } from "../../../../../src/decorator/listeners/AfterUpdate"
import { BeforeInsert } from "../../../../../src/decorator/listeners/BeforeInsert"
import { Column } from "../../../../../src/decorator/columns/Column"
import { CreateDateColumn } from "../../../../../src/decorator/columns/CreateDateColumn"
import { Entity } from "../../../../../src/decorator/entity/Entity"
import { PrimaryColumn } from "../../../../../src/decorator/columns/PrimaryColumn"
import { UpdateDateColumn } from "../../../../../src/decorator/columns/UpdateDateColumn"

@Entity("post")
export class WritePost {
    static beforeInsertCalls = 0
    static afterUpdateCalls = 0

    @PrimaryColumn()
    id: string

    @Column()
    title: string

    @Column({ nullable: true })
    text?: string

    @CreateDateColumn()
    createdAt: Date

    @UpdateDateColumn()
    updatedAt: Date

    constructor(init?: Partial<WritePost>) {
        Object.assign(this, init)
    }

    @BeforeInsert()
    countBeforeInsert() {
        WritePost.beforeInsertCalls++
    }

    @AfterUpdate()
    countAfterUpdate() {
        WritePost.afterUpdateCalls++
    }
}
